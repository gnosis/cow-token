import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants, Contract, Wallet, utils } from "ethers";
import { ethers, waffle } from "hardhat";

import { metadata, Permit, signPermit } from "../src/ts";

import { customError } from "./custom-errors";
import { setTime, setTimeAndMineBlock } from "./utils/timeUtils";

describe("InflationaryToken", () => {
  let token: Contract;
  let cowDao: Wallet;
  let user: Wallet;
  let deployer: Wallet;
  let initialTokenHolder: Wallet;

  const totalSupply = ethers.utils.parseUnits("31337", 18);
  const erc20Name = "erc20Name";
  const erc20Symbol = "erc20Symbol";

  const secondsInOneYear = 60 * 60 * 24 * 365;
  let now: number;
  let oneYearAfterDeployment: number;

  beforeEach(async () => {
    [deployer, initialTokenHolder, cowDao, user] =
      await waffle.provider.getWallets();
    const InflationaryToken = await ethers.getContractFactory(
      "InflationaryToken",
    );
    token = await InflationaryToken.connect(deployer).deploy(
      initialTokenHolder.address,
      cowDao.address,
      totalSupply,
      erc20Name,
      erc20Symbol,
    );
    now = (await ethers.provider.getBlock("latest")).timestamp;
    oneYearAfterDeployment = now + secondsInOneYear;
  });

  it("has expected name", async () => {
    expect(await token.name()).to.equal(erc20Name);
  });

  it("has expected symbol", async () => {
    expect(await token.symbol()).to.equal(erc20Symbol);
  });

  it("has expected decimals", async () => {
    expect(await token.decimals()).to.equal(metadata.real.decimals);
  });

  it("has expected total supply", async () => {
    expect(await token.totalSupply()).to.equal(totalSupply);
  });

  it("sends total supply to initialTokenHolder dao", async () => {
    expect(await token.balanceOf(initialTokenHolder.address)).to.equal(
      totalSupply,
    );
  });

  it("sets the minter role for cowDao", async function () {
    expect(await token.cowDao()).to.equal(cowDao.address);
  });

  describe("mint", () => {
    const amount = ethers.utils.parseUnits("1", 18);
    const to = "0x" + "42".repeat(20);

    it("adjusts the totalSupply", async () => {
      setTime(oneYearAfterDeployment);
      await token.connect(cowDao).mint(to, amount);
      expect(await token.totalSupply()).to.equal(totalSupply.add(amount));
    });

    it("adjusts the timestampLastMinting", async () => {
      setTime(oneYearAfterDeployment);
      await token.connect(cowDao).mint(to, amount);
      expect(await token.timestampLastMinting()).to.equal(
        oneYearAfterDeployment,
      );
    });

    it("grants the token to the receiver", async () => {
      setTime(oneYearAfterDeployment);
      await token.connect(cowDao).mint(to, amount);
      expect(await token.balanceOf(to)).to.equal(amount);
    });

    it("succeeds if amount is right below the cap", async () => {
      setTime(oneYearAfterDeployment);
      const totalSupply = await token.totalSupply();
      const MAX_YEARLY_INFLATION = await token.MAX_YEARLY_INFLATION();
      await expect(
        token
          .connect(cowDao)
          .mint(to, totalSupply.mul(MAX_YEARLY_INFLATION * 10 - 1).div(1000)),
      ).to.not.be.reverted;
    });

    it("reverts if amount is right above cap", async () => {
      setTime(oneYearAfterDeployment);
      const totalSupply = await token.totalSupply();
      const MAX_YEARLY_INFLATION = await token.MAX_YEARLY_INFLATION();
      await expect(
        token
          .connect(cowDao)
          .mint(to, totalSupply.mul(MAX_YEARLY_INFLATION * 10 + 1).div(1000)),
      ).to.be.revertedWith(customError("ExceedingMintCap"));
    });

    it("reverts if minting is called twice within 1 year", async () => {
      const secondsPerDay = 24 * 60 * 60;
      // 364 days after deployment, minting tx is reverted
      setTime(now + 364 * secondsPerDay);
      await expect(token.connect(cowDao).mint(to, amount)).to.be.revertedWith(
        customError("AlreadyInflated"),
      );

      // after one year (365 days), the minting tx goes through
      setTimeAndMineBlock(now + 365 * secondsPerDay);
      await expect(token.connect(cowDao).mint(to, amount)).to.not.be.reverted;

      // one day after the first mint, minting tx is reverted
      setTime(now + 366 * secondsPerDay);
      await expect(token.connect(cowDao).mint(to, amount)).to.be.revertedWith(
        customError("AlreadyInflated"),
      );
    });

    it("reverts, if sender is not cowDao", async () => {
      await expect(token.connect(user).mint(to, amount)).to.be.revertedWith(
        customError("OnlyCowDao"),
      );
    });
  });

  describe("permit", () => {
    let token: Contract;
    let owner: SignerWithAddress;
    let spender: Wallet;
    let deployer: Wallet;

    const initialAmount = ethers.utils.parseUnits("17", 18);

    beforeEach(async () => {
      let ownerWallet: Wallet;
      [deployer, cowDao, ownerWallet, spender] =
        await waffle.provider.getWallets();
      const signer = (await ethers.getSigners()).find(
        (signer) => signer.address == ownerWallet.address,
      );
      if (signer === undefined) {
        throw new Error("Signer for wallet not found");
      }
      owner = signer;

      const InflationaryToken = await ethers.getContractFactory(
        "InflationaryToken",
      );
      token = await InflationaryToken.connect(deployer).deploy(
        initialTokenHolder.address,
        cowDao.address,
        totalSupply,
        erc20Name,
        erc20Symbol,
      );
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      setTime(now + secondsInOneYear);
      token.connect(cowDao).mint(owner.address, initialAmount);
    });

    it("is enabled", async () => {
      const target = "0x" + "42".repeat(20);
      const amount = initialAmount.div(2);
      const permit: Permit = {
        owner: owner.address,
        spender: spender.address,
        token: token.address,
        value: amount,
        deadline: constants.MaxUint256,
      };
      await expect(
        token.connect(spender).transferFrom(owner.address, target, amount),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      const signature = await signPermit(owner, permit);
      await expect(
        token
          .connect(owner)
          .permit(
            permit.owner,
            permit.spender,
            permit.value,
            permit.deadline,
            signature.v,
            signature.r,
            signature.s,
          ),
      )
        .to.emit(token, "Approval")
        .withArgs(permit.owner, permit.spender, permit.value);
      await expect(
        token
          .connect(spender)
          .transferFrom(owner.address, target, permit.value),
      ).not.to.be.reverted;
    });

    it("reverts with bad signature", async () => {
      const permit: Permit = {
        owner: owner.address,
        spender: spender.address,
        token: token.address,
        value: initialAmount.div(2),
        deadline: constants.MaxUint256,
      };
      const signature = await signPermit(owner, permit);
      const badR = utils.arrayify(signature.r);
      badR[0] += 1;
      const badSignature = {
        ...signature,
        r: utils.hexlify(badR),
      };
      await expect(
        token
          .connect(owner)
          .permit(
            permit.owner,
            permit.spender,
            permit.value,
            permit.deadline,
            badSignature.v,
            badSignature.r,
            badSignature.s,
          ),
      ).to.be.revertedWith(
        // note: the revert message is different depending on if ecrecover fails
        // to recover an address or if the recovered address is the wrong one.
        // This string covers both cases as they both contain this substring.
        "invalid signature",
      );
    });
  });
});
