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
  ProvenClaim,
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
  nativeTokenPrice: BigNumber;
  initialCowSupply: BigNumber;
}

async function standardDeployment(
  deploymentParameters: DeploymentParameters,
): Promise<DeploymentData> {
  // Deploy the required tokens
  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const usdcToken = await TestERC20.deploy("USDC", 6);
  const gnoToken = await TestERC20.deploy("GNO", 18);
  const wethToken = await TestERC20.deploy("WETH", 18);

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
    nativeTokenPrice: deploymentParameters.nativeTokenPrice,
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

describe("e2e-tests", () => {
  // In the actual deployment cowDAO, communityFundsTarget, investorFundsTarget, teamController are all gnosis safes.
  // But to keep the e2e tests simple, we use normal EOA.
  // This should not make a difference, as in the e2e tests they are only used to send and receive tokens
  const [
    deployer,
    user,
    userNotEligible,
    cowDao,
    communityFundsTarget,
    investorFundsTarget,
    teamController,
  ] = waffle.provider.getWallets();
  const initialCowSupply = ethers.utils.parseEther("1000");

  // Prices are chosen to be realistic but yet easy to work with, so that the
  // test amounts are meaningful.
  // - 1 COW = 0.15 USDC
  const usdcPrice = utils.parseUnits("0.15", 6);
  // - 1 GNO = 400 USDC
  const usdPerCow = ethers.utils.parseEther("0.15");
  const gnoPrice = usdPerCow.div(400);
  // - 1 WETH = 4000 USDC
  const nativeTokenPrice = usdPerCow.div(4000);
  const priceDenominator = ethers.utils.parseEther("1");
  const wethBalanceOfUser = ethers.utils.parseUnits("234", 18);
  let deploymentData: DeploymentData;
  let vCowTokenSupply: BigNumber;
  let provenClaims: ProvenClaims;
  let claim: Claim;
  let claims: ProvenClaim[];

  it("User Option: claims the user option with WETH and vest it", async () => {
    claim = {
      account: user.address,
      claimableAmount: ethers.utils.parseUnits("1234", 18),
      type: ClaimType.UserOption,
    };
    provenClaims = computeProofs([claim]);
    claims = provenClaims.claims;

    const deploymentParameters: DeploymentParameters = {
      deployer,
      cowDao,
      communityFundsTarget,
      investorFundsTarget,
      teamController,
      provenClaims,
      usdcPrice,
      gnoPrice,
      nativeTokenPrice,
      initialCowSupply,
    };
    deploymentData = await standardDeployment(deploymentParameters);

    const wethToPay = claim.claimableAmount
      .mul(nativeTokenPrice)
      .div(priceDenominator);
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
    vCowTokenSupply = await deploymentData.vCowToken.totalSupply();
    expect(vCowTokenSupply).to.be.equal(claim.claimableAmount);

    expect(await deploymentData.wethToken.balanceOf(user.address)).to.be.equal(
      wethBalanceOfUser.sub(wethToPay),
    );
    expect(await deploymentData.vCowToken.balanceOf(user.address)).to.be.equal(
      claim.claimableAmount,
    );
    expect(
      await deploymentData.wethToken.balanceOf(communityFundsTarget.address),
    ).to.be.equal(wethToPay);
    await expect(
      deploymentData.vCowToken.connect(user).swapAll(),
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

    // Send cowTokens to the vCowToken
    await deploymentData.cowToken
      .connect(cowDao)
      .transfer(deploymentData.vCowToken.address, initialCowSupply);

    // Perform a swapAll
    const vestingPeriod =
      await deploymentData.vCowToken.VESTING_PERIOD_IN_SECONDS();
    setTime(deploymentData.deploymentTimestamp + vestingPeriod / 4);
    await deploymentData.vCowToken.connect(user).swapAll();
    expect(await deploymentData.cowToken.balanceOf(user.address)).to.be.equal(
      claim.claimableAmount.div(4),
    );
    expect(
      await deploymentData.cowToken.balanceOf(deploymentData.vCowToken.address),
    ).to.be.equal(initialCowSupply.sub(claim.claimableAmount.div(4)));
    expect(await deploymentData.vCowToken.totalSupply()).to.be.equal(
      vCowTokenSupply.sub(claim.claimableAmount.div(4)),
    );
    expect(await deploymentData.vCowToken.balanceOf(user.address)).to.equal(
      claim.claimableAmount.mul(3).div(4),
    );
  });

  it("User Option: claims the user option on behalf of someone else with ETH", async () => {
    claim = {
      account: user.address,
      claimableAmount: ethers.utils.parseUnits("1234", 18),
      type: ClaimType.UserOption,
    };
    provenClaims = computeProofs([claim]);
    claims = provenClaims.claims;

    const deploymentParameters: DeploymentParameters = {
      deployer,
      cowDao,
      communityFundsTarget,
      investorFundsTarget,
      teamController,
      provenClaims,
      usdcPrice,
      gnoPrice,
      nativeTokenPrice,
      initialCowSupply,
    };
    deploymentData = await standardDeployment(deploymentParameters);

    const ethToPay = claim.claimableAmount
      .mul(nativeTokenPrice)
      .div(priceDenominator);
    const ethBalanceOfCommunityFundsTarget = await ethers.provider.getBalance(
      communityFundsTarget.address,
    );
    await deploymentData.wethToken
      .connect(deployer)
      .mint(userNotEligible.address, wethBalanceOfUser);
    // Claim vCowTokens
    let executeClaim = fullyExecuteClaim(claims[0]);
    executeClaim.claimedAmount = executeClaim.claimedAmount.div(2);
    await expect(
      deploymentData.vCowToken
        .connect(userNotEligible)
        .claim(...getClaimInput(executeClaim), { value: ethToPay.div(2) }),
    ).to.be.revertedWith("OnlyOwnerCanClaimPartially()");

    executeClaim = fullyExecuteClaim(claims[0]);
    await deploymentData.vCowToken
      .connect(userNotEligible)
      .claim(...getClaimInput(fullyExecuteClaim(claims[0])), {
        value: ethToPay,
      });

    vCowTokenSupply = await deploymentData.vCowToken.totalSupply();
    expect(vCowTokenSupply).to.be.equal(claim.claimableAmount);

    expect(
      await ethers.provider.getBalance(communityFundsTarget.address),
    ).to.be.equal(ethToPay.add(ethBalanceOfCommunityFundsTarget));
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
    expect(await deploymentData.vCowToken.balanceOf(user.address)).to.equal(
      claim.claimableAmount.div(2),
    );
  });
  const gnoBalanceOfUser = ethers.utils.parseUnits("5354", 18);
  it("GNO option: claims the gno option and vest it", async () => {
    claim = {
      account: user.address,
      claimableAmount: ethers.utils.parseUnits("1234", 18),
      type: ClaimType.GnoOption,
    };
    provenClaims = computeProofs([claim]);
    claims = provenClaims.claims;
    const deploymentParameters: DeploymentParameters = {
      deployer,
      cowDao,
      communityFundsTarget,
      investorFundsTarget,
      teamController,
      provenClaims,
      usdcPrice,
      gnoPrice,
      nativeTokenPrice,
      usdPerCow,
      initialCowSupply,
    };
    deploymentData = await standardDeployment(deploymentParameters);

    await deploymentData.gnoToken
      .connect(deployer)
      .mint(user.address, gnoBalanceOfUser);
    // Perform a claim of a gno option
    const gnoToPay = claim.claimableAmount.mul(gnoPrice).div(priceDenominator);

    await deploymentData.gnoToken
      .connect(user)
      .approve(deploymentData.vCowToken.address, gnoToPay);
    await deploymentData.vCowToken
      .connect(user)
      .claim(...getClaimInput(fullyExecuteClaim(claims[0])));
    expect(await deploymentData.gnoToken.balanceOf(user.address)).to.be.equal(
      gnoBalanceOfUser.sub(gnoToPay),
    );
    expect(await deploymentData.vCowToken.balanceOf(user.address)).to.be.equal(
      claim.claimableAmount,
    );
    vCowTokenSupply = await deploymentData.vCowToken.totalSupply();

    // Send cowTokens to the vCowToken
    await deploymentData.cowToken
      .connect(cowDao)
      .transfer(deploymentData.vCowToken.address, claim.claimableAmount.div(3));

    // Perform a swapAll
    const vestingPeriod =
      await deploymentData.vCowToken.VESTING_PERIOD_IN_SECONDS();
    setTime(deploymentData.deploymentTimestamp + vestingPeriod / 3);
    await deploymentData.vCowToken.connect(user).swapAll();
    expect(await deploymentData.cowToken.balanceOf(user.address)).to.be.equal(
      claim.claimableAmount.div(3),
    );
    expect(
      await deploymentData.cowToken.balanceOf(deploymentData.vCowToken.address),
    ).to.be.equal(0);
    expect(await deploymentData.vCowToken.totalSupply()).to.be.equal(
      vCowTokenSupply.sub(claim.claimableAmount.div(3)),
    );
  });
});
