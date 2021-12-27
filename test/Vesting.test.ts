import { expect } from "chai";
import { constants, Contract } from "ethers";
import { ethers } from "hardhat";

import { customError } from "./custom-errors";
import { setTime, setTimeAndMineBlock } from "./utils/timeUtils";

describe("Vesting", () => {
  let vesting: Contract;
  let vestingPeriod: number;
  let vestingStart: number;
  const user = "0x" + "42".repeat(3).padEnd(38, "0") + "00";
  const beneficiary = "0x" + "42".repeat(3).padEnd(38, "0") + "01";

  beforeEach(async () => {
    const VestingContract = await ethers.getContractFactory(
      "VestingTestInterface",
    );
    vesting = await VestingContract.deploy();
    vestingStart = (await ethers.provider.getBlock("latest")).timestamp;
    vestingPeriod = (await vesting.VESTING_PERIOD_IN_SECONDS()).toNumber();
  });

  it("sets the constructor argument correctly", async () => {
    expect(await vesting.vestingStart()).to.equal(vestingStart);
  });

  it("has correct vesting period", async () => {
    expect(await vesting.VESTING_PERIOD_IN_SECONDS()).to.equal(
      60 * 60 * 24 * (365 * 4 + 1),
    );
  });

  describe("addVesting", () => {
    it("increments the full vesting amount for non-cancelable vesting", async () => {
      const amount = ethers.utils.parseUnits("31337", 18);
      await vesting.addVestingTest(user, amount, false);
      expect(await vesting.fullAllocation(user)).to.equal(amount);
      expect(await vesting.isCancelable(user)).to.equal(false);
    });

    it("increments the full vesting amount for cancelable vesting", async () => {
      const amount = ethers.utils.parseUnits("31337", 18);
      await vesting.addVestingTest(user, amount, true);
      expect(await vesting.fullAllocation(user)).to.equal(amount);
      expect(await vesting.isCancelable(user)).to.equal(true);
    });

    it("converts a non-cancelable vesting into a cancelable vesting and adds vesting amounts, if a new cancelable vesting is added", async () => {
      const amount = ethers.utils.parseUnits("31337", 18);
      const furtherAmount = ethers.utils.parseUnits("23434", 18);
      await vesting.addVestingTest(user, amount, false);
      await vesting.addVestingTest(user, furtherAmount, true);
      expect(await vesting.isCancelable(user)).to.equal(true);
      expect(await vesting.fullAllocation(user)).to.equal(
        amount.add(furtherAmount),
      );
    });

    it("does not convert a cancelable vesting into a non-cancelable vesting, if a new non-cancelable vesting is added", async () => {
      const amount = ethers.utils.parseUnits("31337", 18);
      const furtherAmount = ethers.utils.parseUnits("23434", 18);
      await vesting.addVestingTest(user, furtherAmount, true);
      await vesting.addVestingTest(user, amount, false);
      expect(await vesting.isCancelable(user)).to.equal(true);
      expect(await vesting.fullAllocation(user)).to.equal(
        amount.add(furtherAmount),
      );
    });

    it("emits an event", async () => {
      const amount = ethers.utils.parseUnits("31337", 18);
      await expect(vesting.addVestingTest(user, amount, false))
        .to.emit(vesting, "VestingAdded")
        .withArgs(user, amount, false);
    });

    it("adds further amounts on top of existing total for non-cancelable vestings", async () => {
      const amount = ethers.utils.parseUnits("31337", 18);
      await vesting.addVestingTest(user, amount, false);
      const furtherAmount = ethers.utils.parseUnits("1337", 18);
      await vesting.addVestingTest(user, furtherAmount, false);
      expect(await vesting.fullAllocation(user)).to.equal(
        amount.add(furtherAmount),
      );
    });

    it("adds further amounts on top of existing total for cancelable vestings", async () => {
      const amount = ethers.utils.parseUnits("31337", 18);
      await vesting.addVestingTest(user, amount, true);
      const furtherAmount = ethers.utils.parseUnits("1337", 18);
      await vesting.addVestingTest(user, furtherAmount, true);
      expect(await vesting.fullAllocation(user)).to.equal(
        amount.add(furtherAmount),
      );
    });
  });

  describe("stopVesting", () => {
    const amount = ethers.utils.parseUnits("31337", 18);

    it("returns amount vested by user at the time of the call", async () => {
      await vesting.addVestingTest(user, amount, true);
      await setTimeAndMineBlock(vestingStart + vestingPeriod / 4);
      expect(
        await vesting.callStatic.shiftVestingTest(user, beneficiary),
      ).to.equal(amount.div(4));
    });

    it("returns correct values for a cancelable vesting - if 1/8th was already claimed before", async () => {
      await vesting.addVestingTest(user, amount, true);
      await setTime(vestingStart + vestingPeriod / 8);
      await vesting.vestTest(user);
      await setTimeAndMineBlock(vestingStart + (vestingPeriod * 3) / 8);
      expect(
        await vesting.callStatic.shiftVestingTest(user, beneficiary),
      ).to.deep.equal(amount.div(4));
    });

    it("removes the vesting for a cancelable vesting", async () => {
      await vesting.addVestingTest(user, amount, true);
      await setTimeAndMineBlock(vestingStart + vestingPeriod / 4);
      await vesting.shiftVestingTest(user, beneficiary);
      expect(await vesting.fullAllocation(user)).to.be.equal(0);
      expect(await vesting.vestedAllocation(user)).to.be.equal(0);
    });

    it("assigns removed vesting to beneficiary", async () => {
      await vesting.addVestingTest(user, amount, true);
      const userFullAllocation = amount;

      await setTime(vestingStart + vestingPeriod / 4);
      await vesting.shiftVestingTest(user, beneficiary);
      const userVestedAllocation = amount.div(4);

      expect(await vesting.fullAllocation(beneficiary)).to.be.equal(
        userFullAllocation,
      );
      expect(await vesting.vestedAllocation(beneficiary)).to.be.equal(
        userVestedAllocation,
      );
    });

    it("does not overwrite existing beneficiary claim", async () => {
      const beneficiaryFullVestedAmount = ethers.utils.parseUnits("4242", 18);
      await vesting.addVestingTest(
        beneficiary,
        beneficiaryFullVestedAmount,
        false,
      );
      await vesting.addVestingTest(user, amount, true);

      // make vestedAllocation different from zero
      await setTime(vestingStart + vestingPeriod / 8);
      await vesting.vestTest(beneficiary);
      const beneficiaryVestedAllocation = await vesting.vestedAllocation(
        beneficiary,
      );

      await setTime(vestingStart + (vestingPeriod * 3) / 8);
      await vesting.shiftVestingTest(user, beneficiary);
      const userFullAllocation = amount;
      const userVestedAllocation = userFullAllocation.mul(3).div(8);

      expect(await vesting.fullAllocation(beneficiary)).to.be.equal(
        userFullAllocation.add(beneficiaryFullVestedAmount),
      );
      expect(await vesting.vestedAllocation(beneficiary)).to.be.equal(
        userVestedAllocation.add(beneficiaryVestedAllocation),
      );
    });

    it("emits a VestingStopped event", async () => {
      await vesting.addVestingTest(user, amount, true);
      await setTime(vestingStart + vestingPeriod / 4);
      await expect(vesting.shiftVestingTest(user, beneficiary))
        .to.emit(vesting, "VestingStopped")
        .withArgs(user, beneficiary, amount.mul(3).div(4));
    });

    it("emits a Vested event", async () => {
      await vesting.addVestingTest(user, amount, true);
      await setTime(vestingStart + vestingPeriod / 4);
      await expect(vesting.shiftVestingTest(user, beneficiary))
        .to.emit(vesting, "Vested")
        .withArgs(user, amount.div(4));
    });

    it("reverts for non-cancelable vesting", async () => {
      await vesting.addVestingTest(user, amount, false);
      await expect(
        vesting.shiftVestingTest(user, beneficiary),
      ).to.be.revertedWith(customError("VestingNotCancelable"));
    });

    it("reverts if vesting has not yet been initialized", async () => {
      await expect(
        vesting.shiftVestingTest(user, beneficiary),
      ).to.be.revertedWith(customError("VestingNotCancelable"));
    });

    it("returns zeros for an already stopped vesting after vesting has ended", async () => {
      await vesting.addVestingTest(user, amount, true);
      await setTimeAndMineBlock(vestingStart + vestingPeriod / 4);
      await vesting.shiftVestingTest(user, beneficiary);
      await setTimeAndMineBlock(vestingStart + vestingPeriod * 2);
      expect(
        await vesting.callStatic.shiftVestingTest(user, beneficiary),
      ).to.deep.equal(constants.Zero);
    });

    it("returns zeros for an already stopped vesting before vesting has ended", async () => {
      await vesting.addVestingTest(user, amount, true);
      await setTimeAndMineBlock(vestingStart + vestingPeriod / 4);
      await vesting.shiftVestingTest(user, beneficiary);
      await setTimeAndMineBlock(vestingStart + vestingPeriod / 2);
      expect(
        await vesting.callStatic.shiftVestingTest(user, beneficiary),
      ).to.deep.equal(constants.Zero);
    });

    it("stopping twice does not change beneficiary vesting", async () => {
      await vesting.addVestingTest(user, amount, true);
      await setTime(vestingStart + vestingPeriod / 4);
      await vesting.shiftVestingTest(user, beneficiary);

      const beneficiaryFullAllocation = await vesting.fullAllocation(
        beneficiary,
      );
      const beneficiaryVestedAllocation = await vesting.vestedAllocation(
        beneficiary,
      );
      await setTime(vestingStart + vestingPeriod / 2);
      await vesting.shiftVestingTest(user, beneficiary);
      expect(await vesting.fullAllocation(beneficiary)).to.be.equal(
        beneficiaryFullAllocation,
      );
      expect(await vesting.vestedAllocation(beneficiary)).to.be.equal(
        beneficiaryVestedAllocation,
      );
    });

    it("assigns the vested amount to the beneficiary if user and beneficiary are the same [regression]", async () => {
      await vesting.addVestingTest(beneficiary, amount, true);
      await setTime(vestingStart + vestingPeriod / 4);
      await vesting.shiftVestingTest(beneficiary, beneficiary);
      expect(await vesting.fullAllocation(beneficiary)).to.be.equal(amount);
      expect(await vesting.vestedAllocation(beneficiary)).to.be.equal(
        amount.div(4),
      );
    });

    it("returns the expected vesting if user and beneficiary are the same [regression]", async () => {
      await vesting.addVestingTest(beneficiary, amount, true);
      await setTimeAndMineBlock(vestingStart + vestingPeriod / 4);
      expect(
        await vesting.callStatic.shiftVestingTest(beneficiary, beneficiary),
      ).to.be.equal(amount.div(4));
    });
  });

  describe("cumulativeVestedBalance", () => {
    it("calculates the amount of convertible tokens correctly at half the vesting period", async () => {
      const amount = ethers.utils.parseUnits("114546", 18);
      await vesting.addVestingTest(user, amount, false);
      await setTimeAndMineBlock(vestingStart + vestingPeriod / 2);
      expect(await vesting.cumulativeVestedBalance(user)).to.equal(
        amount.div(2),
      );
    });

    it("calculates the amount of convertible tokens correctly at 10 mins into the vesting period", async () => {
      const amount = ethers.utils.parseUnits("546", 18);
      await vesting.addVestingTest(user, amount, false);
      const tenMinutesInSecs = 60 * 10;
      await setTimeAndMineBlock(vestingStart + tenMinutesInSecs * 1);
      expect(await vesting.cumulativeVestedBalance(user)).to.equal(
        amount.mul(tenMinutesInSecs).div(vestingPeriod),
      );
    });

    it("calculates the amount of convertible tokens correctly after the vesting period", async () => {
      const amount = ethers.utils.parseUnits("0.1", 18);
      await vesting.addVestingTest(user, amount, false);
      await setTimeAndMineBlock(vestingStart + vestingPeriod * 2);
      expect(await vesting.cumulativeVestedBalance(user)).to.equal(amount);
    });
  });

  describe("vest", () => {
    const amount = ethers.utils.parseUnits("31337", 18);

    beforeEach(async () => {
      await vesting.addVestingTest(user, amount, false);
    });

    it("checks that vestTest updates vestedAllocation correctly: once at half time and once at the end", async () => {
      // Converting half of the amount
      await setTime(vestingStart + vestingPeriod / 2);
      await vesting.vestTest(user);
      expect(await vesting.vestedAllocation(user)).to.equal(amount.div(2));
      // Converting rest at the end
      await setTime(vestingStart + vestingPeriod * 1);
      await vesting.vestTest(user);
      expect(await vesting.vestedAllocation(user)).to.equal(amount);
    });

    it("emits an event", async () => {
      await setTime(vestingStart + vestingPeriod / 2);

      await expect(vesting.vestTest(user))
        .to.emit(vesting, "Vested")
        .withArgs(user, amount.div(2));
    });

    it("checks that the return value is correct, if user has not converted before", async () => {
      // Converting half of the amount
      await setTimeAndMineBlock(vestingStart + vestingPeriod / 2);
      expect(await vesting.callStatic.vestTest(user)).to.equal(amount.div(2));
    });

    it("checks that the return value is correct, if user first claims half and then later the second half", async () => {
      // Converting half of the amount
      await setTime(vestingStart + vestingPeriod / 2);
      await vesting.vestTest(user);
      // Converting half of the amount at the end of vesting period
      await setTimeAndMineBlock(vestingStart + vestingPeriod * 1);
      expect(await vesting.callStatic.vestTest(user)).to.equal(amount.div(2));
    });

    it("checks that the return value is correct, after vesting time", async () => {
      await setTimeAndMineBlock(vestingStart + vestingPeriod * 2);
      expect(await vesting.callStatic.vestTest(user)).to.equal(amount);
    });
  });

  describe("newlyVestedBalance", () => {
    it("calculates the amount of convertible tokens correctly if no conversion has been processed", async () => {
      const amount = ethers.utils.parseUnits("114546", 18);
      await vesting.addVestingTest(user, amount, false);
      await setTimeAndMineBlock(vestingStart + vestingPeriod / 2);
      expect(await vesting.newlyVestedBalance(user)).to.equal(amount.div(2));
    });

    it("calculates the amount of convertible tokens correctly if a conversion has been processed", async () => {
      const amount = ethers.utils.parseUnits("114546", 18);
      await vesting.addVestingTest(user, amount, false);
      // Converting half of the tokens
      await setTime(vestingStart + vestingPeriod / 2);
      await vesting.vestTest(user);
      // See that 1/4 of the tokens is available at 3/4 of vesting time
      await setTimeAndMineBlock(vestingStart + (vestingPeriod * 3) / 4);
      expect(await vesting.newlyVestedBalance(user)).to.equal(amount.div(4));
    });
  });
});
