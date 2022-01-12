import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20.json";
import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { constants, Contract, ContractFactory, utils } from "ethers";
import { ethers, waffle } from "hardhat";

import {
  constructorInput,
  Claim,
  ContractName,
  metadata,
  VirtualTokenDeployParams,
  ClaimType,
  computeProofs,
  getClaimInput,
  ProvenClaim,
} from "../src/ts";

import { fullyExecuteClaim } from "./claiming";
import { customError } from "./custom-errors";
import { setTime, setTimeAndMineBlock } from "./utils/timeUtils";

const allClaimTypes: ClaimType[] = Object.keys(ClaimType)
  .map((c) => Number(c))
  .filter((c) => !isNaN(c));

describe("CowProtocolVirtualToken", () => {
  let token: Contract;
  let realToken: MockContract;
  let usdcToken: MockContract;
  let gnoToken: MockContract;
  let wethToken: MockContract;
  let CowProtocolVirtualToken: ContractFactory;

  const [deployer, executor, user, teamController, teamMember] =
    waffle.provider.getWallets();

  const merkleRoot = "0x" + "42".repeat(32);
  const communityFundsTarget = "0x" + "42".repeat(3).padEnd(38, "0") + "01";
  const investorFundsTarget = "0x" + "42".repeat(3).padEnd(38, "0") + "02";
  const usdcPrice = 31337;
  const gnoPrice = 42;
  const wethPrice = 1337;
  let deploymentParams: VirtualTokenDeployParams;

  beforeEach(async () => {
    realToken = await waffle.deployMockContract(deployer, IERC20.abi);
    usdcToken = await waffle.deployMockContract(deployer, IERC20.abi);
    gnoToken = await waffle.deployMockContract(deployer, IERC20.abi);
    wethToken = await waffle.deployMockContract(deployer, IERC20.abi);

    CowProtocolVirtualToken = (
      await ethers.getContractFactory(ContractName.VirtualToken)
    ).connect(deployer);
    deploymentParams = {
      merkleRoot,
      realToken: realToken.address,
      investorFundsTarget,
      gnoToken: gnoToken.address,
      usdcToken: usdcToken.address,
      wethToken: wethToken.address,
      communityFundsTarget,
      usdcPrice,
      gnoPrice,
      wethPrice,
      teamController: teamController.address,
      startTimestamp: 0,
    };
  });

  describe("constructor parameters", async function () {
    beforeEach(async function () {
      token = await CowProtocolVirtualToken.deploy(
        ...constructorInput(ContractName.VirtualToken, deploymentParams),
      );
    });

    it("has expected name", async () => {
      expect(await token.name()).to.equal(metadata.virtual.name);
    });

    it("has expected symbol", async () => {
      expect(await token.symbol()).to.equal(metadata.virtual.symbol);
    });

    it("has 18 decimals", async () => {
      expect(await token.decimals()).to.equal(metadata.virtual.decimals);
    });

    it("has expected merkle root", async () => {
      expect(await token.merkleRoot()).to.equal(merkleRoot);
    });

    it("has expected real token", async () => {
      expect(await token.cowToken()).to.equal(realToken.address);
    });

    it("sets the expected community funds target", async function () {
      expect(await token.communityFundsTarget()).to.equal(communityFundsTarget);
    });

    it("sets the expected USDC token", async function () {
      expect(await token.usdcToken()).to.equal(usdcToken.address);
    });

    it("sets the expected USDC price", async function () {
      expect(await token.usdcPrice()).to.equal(usdcPrice);
    });

    it("sets the expected GNO token", async function () {
      expect(await token.gnoToken()).to.equal(gnoToken.address);
    });

    it("sets the expected GNO price", async function () {
      expect(await token.gnoPrice()).to.equal(gnoPrice);
    });

    it("sets the expected WETH token", async function () {
      expect(await token.wethToken()).to.equal(wethToken.address);
    });

    it("sets the expected WETH price", async function () {
      expect(await token.wethPrice()).to.equal(wethPrice);
    });

    it("sets the expected team controller", async function () {
      expect(await token.teamController()).to.equal(teamController.address);
    });
  });

  it("has only known public functions acting on the state", async function () {
    const erc20TokenFunctions = [
      "approve(address,uint256)",
      "transfer(address,uint256)",
      "transferFrom(address,address,uint256)",
    ];
    const storageAccessibleFunctions = [
      "simulateDelegatecall(address,bytes)",
      "simulateDelegatecallInternal(address,bytes)",
    ];
    const customPublicFunctions = [
      "claim(uint256,uint8,address,uint256,uint256,bytes32[])",
      "claimMany(uint256[],uint8[],address[],uint256[],uint256[],bytes32[][],uint256[])",
      "stopClaim(address)",
      "swap(uint256)",
      "swapAll()",
    ];
    const goodPublicFunctions = [
      ...erc20TokenFunctions,
      ...storageAccessibleFunctions,
      ...customPublicFunctions,
    ];
    const { functions } = CowProtocolVirtualToken.interface;
    const actualPublicFunctions = Object.keys(functions).filter(
      (name) => !["view", "pure"].includes(functions[name].stateMutability),
    );
    for (const f of actualPublicFunctions) {
      expect(goodPublicFunctions).to.include(f);
    }
  });

  describe("claim stopping", async function () {
    let vestingPeriod: number;
    let vestingStart: number;

    const teamMemberClaim: Claim = {
      account: teamMember.address,
      claimableAmount: utils.parseUnits("31337", 18),
      type: ClaimType.Team,
    };
    const airdropTeamMember: Claim = {
      account: teamMember.address,
      claimableAmount: utils.parseUnits("1337", 18),
      type: ClaimType.Airdrop,
    };
    const optionTeamController: Claim = {
      account: teamController.address,
      claimableAmount: utils.parseUnits("4242", 18),
      type: ClaimType.Advisor,
    };
    const otherClaims: Claim[] = allClaimTypes
      .filter((ct) => ct != ClaimType.Team)
      .map((type, i) => ({
        type,
        claimableAmount: utils.parseUnits(i.toString(), 18),
        account: teamMember.address,
      }));

    const {
      merkleRoot,
      claims: [
        provenTeamMemberClaim,
        provenAirdropTeamMember,
        provenOptionTeamController,
        ...otherProvenClaims
      ],
    } = computeProofs([
      teamMemberClaim,
      airdropTeamMember,
      optionTeamController,
      ...otherClaims,
    ]);

    beforeEach(async function () {
      token = (
        await CowProtocolVirtualToken.deploy(
          ...constructorInput(ContractName.VirtualToken, {
            ...deploymentParams,
            merkleRoot,
          }),
        )
      ).connect(executor);
      vestingStart = (await ethers.provider.getBlock("latest")).timestamp;
      vestingPeriod = Number(await token.VESTING_PERIOD_IN_SECONDS());
    });

    describe("on team claims", function () {
      beforeEach(async function () {
        await token.claim(
          ...getClaimInput(fullyExecuteClaim(provenTeamMemberClaim)),
        );
        expect(await token.fullAllocation(teamMember.address)).to.equal(
          teamMemberClaim.claimableAmount,
        );
      });

      it("does not revert", async function () {
        await expect(
          token.connect(teamController).stopClaim(teamMember.address),
        ).not.to.be.reverted;
      });

      it("stops the claim for the user", async function () {
        await token.connect(teamController).stopClaim(teamMember.address);
        expect(await token.fullAllocation(teamMember.address)).to.equal(0);
      });

      it("can only be executed by the team controller", async function () {
        expect(executor.address).not.to.equal(teamController.address);
        await expect(
          token.connect(executor).stopClaim(teamMember.address),
        ).to.be.revertedWith(customError("OnlyTeamController"));
      });

      it("assigns to the stopped user the amount vested so far", async function () {
        await setTime(vestingStart + vestingPeriod / 4);
        await token.connect(teamController).stopClaim(teamMember.address);

        const accruedAmount = teamMemberClaim.claimableAmount.div(4);
        expect(
          await token.instantlySwappableBalance(teamMember.address),
        ).to.equal(accruedAmount);

        await realToken.mock.transfer.returns(true);
        expect(await token.connect(teamMember).callStatic.swapAll()).to.equal(
          accruedAmount,
        );
      });

      it("assigns to the team controller the remaining vesting", async function () {
        await setTime(vestingStart + vestingPeriod / 4);
        await token.connect(teamController).stopClaim(teamMember.address);

        await setTime(vestingStart + vestingPeriod);

        const accruedAmount = teamMemberClaim.claimableAmount.mul(3).div(4);
        await realToken.mock.transfer.returns(true);
        expect(
          await token.connect(teamController).callStatic.swapAll(),
        ).to.equal(accruedAmount);
      });

      it("adds on top of exisiting airdrop", async function () {
        await token.claim(
          ...getClaimInput(fullyExecuteClaim(provenAirdropTeamMember)),
        );
        expect(
          await token.instantlySwappableBalance(teamMember.address),
        ).to.equal(provenAirdropTeamMember.claimableAmount);

        await setTime(vestingStart + vestingPeriod / 4);
        await token.connect(teamController).stopClaim(teamMember.address);

        const accruedTeamMemberAmount =
          provenAirdropTeamMember.claimableAmount.add(
            teamMemberClaim.claimableAmount.div(4),
          );
        expect(
          await token.instantlySwappableBalance(teamMember.address),
        ).to.equal(accruedTeamMemberAmount);

        await realToken.mock.transfer.returns(true);
        expect(await token.connect(teamMember).callStatic.swapAll()).to.equal(
          accruedTeamMemberAmount,
        );
      });

      it("accounts for the case that the user already swapped", async function () {
        await realToken.mock.transfer.returns(true);
        await setTime(vestingStart + vestingPeriod / 8);
        // user withdraws 1/8th of the claim
        await token.connect(teamMember).swapAll();

        await setTime(vestingStart + (vestingPeriod * 3) / 8);
        await token.connect(teamController).stopClaim(teamMember.address);

        // 1/8th was already withdrawn, only 3/8-1/8=2/8th left
        const accruedTeamMemberAmount = teamMemberClaim.claimableAmount
          .mul(2)
          .div(8);
        const accruedTeamControllerAmount = teamMemberClaim.claimableAmount
          .mul(5)
          .div(8);

        expect(
          await token.instantlySwappableBalance(teamMember.address),
        ).to.equal(accruedTeamMemberAmount);

        expect(await token.connect(teamMember).callStatic.swapAll()).to.equal(
          accruedTeamMemberAmount,
        );
        await setTimeAndMineBlock(vestingStart + vestingPeriod);
        expect(
          await token.connect(teamController).callStatic.swapAll(),
        ).to.equal(accruedTeamControllerAmount);
      });

      it("adds on top of exisiting team controller option", async function () {
        await token.claim(
          ...getClaimInput(fullyExecuteClaim(provenOptionTeamController)),
        );
        expect(await token.fullAllocation(teamController.address)).to.equal(
          provenOptionTeamController.claimableAmount,
        );

        // Make the vested amount partially swapped to verify that this doesn't
        // influence the math.
        await realToken.mock.transfer.returns(true);
        await setTime(vestingStart + vestingPeriod / 8);
        await token.connect(teamController).swapAll();
        expect(await token.vestedAllocation(teamController.address)).to.equal(
          provenOptionTeamController.claimableAmount.div(8),
        );

        await setTime(vestingStart + (vestingPeriod * 3) / 8);
        await token.connect(teamController).stopClaim(teamMember.address);

        await setTimeAndMineBlock(vestingStart + (vestingPeriod * 6) / 8);
        // Team controller gets:
        // - (6/8 - 1/8) of the original claim (vested minus already swapped)
        // - (6/8 - 3/8) of the vesting amount of the stopped user (vested minus
        //   amount that was previously taken by the user).
        const accruedTeamControllerAmount =
          provenOptionTeamController.claimableAmount
            .mul(5)
            .div(8)
            .add(provenTeamMemberClaim.claimableAmount.mul(3).div(8));
        expect(
          await token.connect(teamController).callStatic.swapAll(),
        ).to.equal(accruedTeamControllerAmount);
      });

      it("stopping is idempotent", async function () {
        await setTime(vestingStart + vestingPeriod / 4);
        await token.connect(teamController).stopClaim(teamMember.address);

        const balanceTeamMember = await token.instantlySwappableBalance(
          teamMember.address,
        );
        const teamControllerFullAllocation = await token.fullAllocation(
          teamController.address,
        );
        const teamControllervestedAllocation = await token.vestedAllocation(
          teamController.address,
        );

        await token.connect(teamController).stopClaim(teamMember.address);

        expect(
          await token.instantlySwappableBalance(teamMember.address),
        ).to.equal(balanceTeamMember);
        expect(await token.fullAllocation(teamController.address)).to.equal(
          teamControllerFullAllocation,
        );
        expect(await token.vestedAllocation(teamController.address)).to.equal(
          teamControllervestedAllocation,
        );
      });
    });

    describe("on non-team claim", function () {
      beforeEach(async function () {
        await realToken.mock.transfer.returns(true);
        await usdcToken.mock.transferFrom.returns(true);
        await gnoToken.mock.transferFrom.returns(true);
        await wethToken.mock.transferFrom.returns(true);
      });

      function testClaim(provenClaim: ProvenClaim) {
        it(ClaimType[provenClaim.type], async function () {
          await token.claim(...getClaimInput(fullyExecuteClaim(provenClaim)));

          await expect(
            token.connect(teamController).stopClaim(teamMember.address),
          ).to.be.revertedWith(customError("VestingNotCancelable"));
        });
      }

      for (const claim of otherProvenClaims) {
        testClaim(claim);
      }

      it("no claim", async function () {
        await expect(
          token.connect(teamController).stopClaim(teamMember.address),
        ).to.be.revertedWith(customError("VestingNotCancelable"));
      });
    });
  });

  describe("balanceOf", () => {
    const instantlySwappableAmount = ethers.utils.parseUnits("1337", 18);
    const vestingAmount = ethers.utils.parseUnits("5437", 18);

    beforeEach(async () => {
      const CowProtocolVirtualToken = await ethers.getContractFactory(
        "CowProtocolVirtualTokenTestInterface",
      );
      token = await CowProtocolVirtualToken.connect(deployer).deploy(
        ...constructorInput(ContractName.VirtualToken, deploymentParams),
      );
    });

    it("returns expected results, if user has no amounts", async () => {
      expect(await token.balanceOf(user.address)).to.be.equal(constants.Zero);
    });

    it("returns expected results, if user has only instantly swappable amounts", async () => {
      await token.addInstantlySwappableTokensTest(
        user.address,
        instantlySwappableAmount,
      );
      expect(await token.balanceOf(user.address)).to.be.equal(
        instantlySwappableAmount,
      );
    });

    it("returns expected results, if user has only vestings", async () => {
      await token.addVestingTest(user.address, vestingAmount, true);
      expect(await token.balanceOf(user.address)).to.be.equal(vestingAmount);
    });

    it("returns expected results, if user has vestings and swappable amount", async () => {
      await token.addInstantlySwappableTokensTest(
        user.address,
        instantlySwappableAmount,
      );
      await token.addVestingTest(user.address, vestingAmount, true);
      expect(await token.balanceOf(user.address)).to.be.equal(
        instantlySwappableAmount.add(vestingAmount),
      );
    });

    it("returns expected results, if user has vestings and swappable amount, and swapped before", async () => {
      await token.addInstantlySwappableTokensTest(
        user.address,
        instantlySwappableAmount,
      );
      await token.addVestingTest(user.address, vestingAmount, true);
      // prepare swapping
      const vestingPeriod = await token.VESTING_PERIOD_IN_SECONDS();
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      setTimeAndMineBlock(now + vestingPeriod / 2);
      const swappedAmount = ethers.utils.parseUnits("3", 18);
      await token.increaseTotalSupply(swappedAmount);
      await realToken.mock.transfer
        .withArgs(user.address, swappedAmount)
        .returns(true);
      // execute the swapping
      await token.connect(user).swap(swappedAmount);

      expect(await token.balanceOf(user.address)).to.be.equal(
        vestingAmount.add(instantlySwappableAmount).sub(swappedAmount),
      );
    });
  });

  describe("swappableBalanceOf", () => {
    const instantlySwappableAmount = ethers.utils.parseUnits("1337", 18);
    const vestingAmount = ethers.utils.parseUnits("5437", 18);

    beforeEach(async () => {
      const CowProtocolVirtualToken = await ethers.getContractFactory(
        "CowProtocolVirtualTokenTestInterface",
      );
      token = await CowProtocolVirtualToken.connect(deployer).deploy(
        ...constructorInput(ContractName.VirtualToken, deploymentParams),
      );
    });

    it("returns expected results, if user has no amounts", async () => {
      expect(await token.swappableBalanceOf(user.address)).to.be.equal(
        constants.Zero,
      );
    });

    it("returns expected results, if user has only instantly swappable amounts", async () => {
      await token.addInstantlySwappableTokensTest(
        user.address,
        instantlySwappableAmount,
      );
      expect(await token.swappableBalanceOf(user.address)).to.be.equal(
        instantlySwappableAmount,
      );
    });

    it("returns expected results, if user has only vestings", async () => {
      await token.addVestingTest(user.address, vestingAmount, true);
      const convertibleVestingBalance = await token.newlyVestedBalance(
        user.address,
      );
      expect(convertibleVestingBalance.gt(0)).to.be.true;
      expect(await token.swappableBalanceOf(user.address)).to.be.equal(
        convertibleVestingBalance,
      );
    });

    it("returns expected results, if user has vestings and swappable amount", async () => {
      await token.addInstantlySwappableTokensTest(
        user.address,
        instantlySwappableAmount,
      );
      await token.addVestingTest(user.address, vestingAmount, true);
      const convertibleVestingBalance = await token.newlyVestedBalance(
        user.address,
      );
      expect(convertibleVestingBalance.gt(0)).to.be.true;
      expect(await token.swappableBalanceOf(user.address)).to.be.equal(
        convertibleVestingBalance.add(instantlySwappableAmount),
      );
    });
  });
});
