import { expect } from "chai";
import { constants, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";

import { customError } from "./custom-errors";

describe("NonTransferrableErc20", () => {
  let token: Contract;
  let NonTransferrableErc20: ContractFactory;

  const symbol = "SYMBOL";
  const name = "Name";

  beforeEach(async () => {
    NonTransferrableErc20 = await ethers.getContractFactory(
      "NonTransferrableErc20TestInterface",
    );
    token = await NonTransferrableErc20.deploy(name, symbol);
  });

  it("has expected name", async () => {
    expect(await token.name()).to.equal(name);
  });

  it("has expected symbol", async () => {
    expect(await token.symbol()).to.equal(symbol);
  });

  it("has 18 decimals", async () => {
    expect(await token.decimals()).to.equal(18);
  });

  it("reverts transfer", async () => {
    await expect(
      token.transfer("0x" + "42".repeat(20), ethers.constants.One),
    ).to.be.revertedWith(customError("NotSupported"));
  });

  it("reverts transferFrom", async () => {
    await expect(
      token.transferFrom(
        "0x" + "42".repeat(20),
        "0x" + "21".repeat(20),
        ethers.constants.One,
      ),
    ).to.be.revertedWith(customError("NotSupported"));
  });

  it("reverts approvals", async () => {
    await expect(
      token.approve("0x" + "42".repeat(20), ethers.constants.One),
    ).to.be.revertedWith(customError("NotSupported"));
  });

  it("returns empty allowance", async () => {
    expect(
      await token.allowance("0x" + "42".repeat(20), "0x" + "21".repeat(20)),
    ).to.deep.equal(constants.Zero);
  });
});
