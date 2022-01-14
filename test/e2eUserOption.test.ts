import { expect } from "chai";
import { BigNumber, Contract, utils, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";

import {
  Claim,
  ClaimType,
  computeProofs,
  constructorInput,
  ContractName,
  getClaimInput,
  ProvenClaims,
  RealTokenDeployParams,
  VirtualTokenDeployParams,
} from "../src/ts";

import { fullyExecuteClaim } from "./claiming";
import { setTime } from "./utils/timeUtils";

interface DeploymentData {
  cowToken: Contract;
  vCowToken: Contract;
  usdcToken: Contract;
  gnoToken: Contract;
  wethToken: Contract;
  deploymentTimestamp: number;
}
interface DeploymentParameters {
  deployer: Wallet;
  cowDao: Wallet;
  investorFundsTarget: Wallet;
  teamController: Wallet;
  communityFundsTarget: Wallet;
  provenClaims: ProvenClaims;
  usdcPrice: BigNumber;
  gnoPrice: BigNumber;
  cowPerWethPriceNumerator: BigNumber;
  usdPerCow: BigNumber;
  initialCowSupply: BigNumber;
}

async function standardDeployment(
  deploymentParameters: DeploymentParameters,
): Promise<DeploymentData> {
  // Deploy the required tokens
  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const usdcToken = await TestERC20.deploy("USDC");
  const gnoToken = await TestERC20.deploy("GNO");
  const wethToken = await TestERC20.connect(
    deploymentParameters.deployer,
  ).deploy("WETH");

  // Deploying of the CowToken
  const CowSwapToken = await ethers.getContractFactory(ContractName.RealToken);
  const realTokenDeploymentParams: RealTokenDeployParams = {
    cowDao: deploymentParameters.cowDao.address,
    totalSupply: deploymentParameters.initialCowSupply,
  };
  const cowToken = await CowSwapToken.deploy(
    ...constructorInput(ContractName.RealToken, realTokenDeploymentParams),
  );

  // Deploying of the CowSwapVirtualToken
  const CowSwapVirtualToken = await ethers.getContractFactory(
    ContractName.VirtualToken,
  );
  const deploymentParams: VirtualTokenDeployParams = {
    merkleRoot: deploymentParameters.provenClaims.merkleRoot,
    realToken: cowToken.address,
    investorFundsTarget: deploymentParameters.investorFundsTarget.address,
    gnoToken: gnoToken.address,
    usdcToken: usdcToken.address,
    wrappedNativeToken: wethToken.address,
    communityFundsTarget: deploymentParameters.communityFundsTarget.address,
    usdcPrice: deploymentParameters.usdcPrice,
    gnoPrice: deploymentParameters.gnoPrice,
    nativeTokenPrice: deploymentParameters.cowPerWethPriceNumerator,
    teamController: deploymentParameters.teamController.address,
  };
  const vCowToken = await CowSwapVirtualToken.deploy(
    ...constructorInput(ContractName.VirtualToken, deploymentParams),
  );
  const deploymentTimestamp = (await ethers.provider.getBlock("latest"))
    .timestamp;

  return {
    cowToken,
    vCowToken,
    usdcToken,
    gnoToken,
    wethToken,
    deploymentTimestamp,
  };
}

describe("e2e user option", () => {
  // In the actual deployment cowDAO, communityFundsTarget, investorFundsTarget, teamController are all gnosis safes.
  // But to keep the e2e tests simple, we use normal EOA.
  // This should not make a difference, as in the e2e tests they are only used to send and receive tokens
  const [
    deployer,
    user,
    user_not_eligible,
    cowDao,
    communityFundsTarget,
    investorFundsTarget,
    teamController,
  ] = waffle.provider.getWallets();
  const initialCowSupply = ethers.utils.parseEther("1000");
  const claim: Claim = {
    account: user.address,
    claimableAmount: ethers.utils.parseUnits("234", 18),
    type: ClaimType.UserOption,
  };
  const provenClaims = computeProofs([claim]);

  // Prices are chosen to be realistic but yet easy to work with, so that the
  // test amounts are meaningful.
  // - 1 COW = 0.15 USDC
  const usdcPrice = utils.parseUnits("0.15", 6);
  // - 1 GNO = 400 USDC
  const gnoPrice = utils.parseUnits("0.15", 18).div(400);
  const usdPerCow = ethers.utils.parseEther("0.15");
  // - 1 WETH = 4000 USDC
  const cowPerWethPriceNumerator = usdPerCow.div(4000);
  const cowPerWethPriceDenominator = ethers.utils.parseEther("1");
  const wethBalanceOfUser = ethers.utils.parseUnits("234", 18);

  let deploymentData: DeploymentData;

  beforeEach(async function () {
    const deploymentParameters: DeploymentParameters = {
      deployer,
      cowDao,
      communityFundsTarget,
      investorFundsTarget,
      teamController,
      provenClaims,
      usdcPrice,
      gnoPrice,
      cowPerWethPriceNumerator,
      usdPerCow,
      initialCowSupply,
    };
    deploymentData = await standardDeployment(deploymentParameters);
  });
  const { claims } = provenClaims;

  const wethToPay = claim.claimableAmount
    .mul(cowPerWethPriceNumerator)
    .div(cowPerWethPriceDenominator);

  it("claims the user option and vest it", async () => {
    await deploymentData.wethToken
      .connect(deployer)
      .mint(user.address, wethBalanceOfUser);
    // Claim vCowTokens
    await deploymentData.wethToken
      .connect(user)
      .approve(deploymentData.vCowToken.address, wethToPay);
    await deploymentData.vCowToken
      .connect(user)
      .claim(...getClaimInput(fullyExecuteClaim(claims[0])));

    const vCowTokenSupply = await deploymentData.vCowToken.totalSupply();
    expect(vCowTokenSupply).to.be.equal(claim.claimableAmount);

    expect(await deploymentData.wethToken.balanceOf(user.address)).to.be.equal(
      wethBalanceOfUser.sub(wethToPay),
    );
    expect(await deploymentData.vCowToken.balanceOf(user.address)).to.be.equal(
      claim.claimableAmount,
    );
    await expect(
      deploymentData.vCowToken.connect(user).swapAll(),
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

    // Send cowTokens to the vCowToken
    await deploymentData.cowToken
      .connect(cowDao)
      .transfer(deploymentData.vCowToken.address, claim.claimableAmount.div(2));

    // Perform a swapAll
    const vestingPeriod =
      await deploymentData.vCowToken.VESTING_PERIOD_IN_SECONDS();
    setTime(deploymentData.deploymentTimestamp + vestingPeriod / 2);
    await deploymentData.vCowToken.connect(user).swapAll();
    expect(await deploymentData.cowToken.balanceOf(user.address)).to.be.equal(
      claim.claimableAmount.div(2),
    );
    expect(
      await deploymentData.cowToken.balanceOf(deploymentData.vCowToken.address),
    ).to.be.equal(0);
    expect(await deploymentData.vCowToken.totalSupply()).to.be.equal(
      vCowTokenSupply.sub(claim.claimableAmount.div(2)),
    );
  });
  it("claims the user option on behalf of someone else", async () => {
    await deploymentData.wethToken
      .connect(deployer)
      .mint(user_not_eligible.address, wethBalanceOfUser);
    // Claim vCowTokens
    await deploymentData.wethToken
      .connect(user_not_eligible)
      .approve(deploymentData.vCowToken.address, wethToPay);
    let executeClaim = fullyExecuteClaim(claims[0]);
    executeClaim.claimedAmount = executeClaim.claimedAmount.div(2);
    await expect(
      deploymentData.vCowToken
        .connect(user_not_eligible)
        .claim(...getClaimInput(executeClaim)),
    ).to.be.revertedWith("OnlyOwnerCanClaimPartially()");

    executeClaim = fullyExecuteClaim(claims[0]);
    await deploymentData.vCowToken
      .connect(user_not_eligible)
      .claim(...getClaimInput(fullyExecuteClaim(claims[0])));

    const vCowTokenSupply = await deploymentData.vCowToken.totalSupply();
    expect(vCowTokenSupply).to.be.equal(claim.claimableAmount);

    expect(
      await deploymentData.wethToken.balanceOf(user_not_eligible.address),
    ).to.be.equal(wethBalanceOfUser.sub(wethToPay));
    expect(await deploymentData.vCowToken.balanceOf(user.address)).to.be.equal(
      claim.claimableAmount,
    );
    await expect(
      deploymentData.vCowToken.connect(user).swapAll(),
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

    // Send cowTokens to the vCowToken
    await deploymentData.cowToken
      .connect(cowDao)
      .transfer(deploymentData.vCowToken.address, claim.claimableAmount.div(2));

    // Perform a swapAll
    const vestingPeriod =
      await deploymentData.vCowToken.VESTING_PERIOD_IN_SECONDS();
    setTime(deploymentData.deploymentTimestamp + vestingPeriod / 2);
    await deploymentData.vCowToken.connect(user).swapAll();
    expect(await deploymentData.cowToken.balanceOf(user.address)).to.be.equal(
      claim.claimableAmount.div(2),
    );
    expect(
      await deploymentData.cowToken.balanceOf(deploymentData.vCowToken.address),
    ).to.be.equal(0);
    expect(await deploymentData.vCowToken.totalSupply()).to.be.equal(
      vCowTokenSupply.sub(claim.claimableAmount.div(2)),
    );
  });
});
