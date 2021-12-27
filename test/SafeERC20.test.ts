import { expect } from "chai";
import { Contract } from "ethers";
import { ethers, waffle } from "hardhat";

describe("SafeERC20", function () {
  let safeErc20Tester: Contract;
  const [deployer] = waffle.provider.getWallets();

  const receiver = "0x" + "13".repeat(20);
  const amount = 1337;

  beforeEach(async function () {
    const SafeERC20TestInterface = await ethers.getContractFactory(
      "SafeERC20TestInterface",
    );
    safeErc20Tester = await SafeERC20TestInterface.deploy();
  });

  it("reverts if trying to transfer a token with no code", async function () {
    const token = "0x" + "42".repeat(20);
    expect(await ethers.provider.getCode(token)).to.equal("0x");

    await expect(
      safeErc20Tester.transfer(token, receiver, amount),
    ).to.be.revertedWith("SafeERC20: not a contract");
  });

  it("reverts when too much data is returned", async () => {
    const amount = ethers.utils.parseEther("1.0");

    const sellToken = await waffle.deployMockContract(deployer, [
      "function transfer(address, uint256) returns (bytes)",
    ]);
    await sellToken.mock.transfer
      .withArgs(receiver, amount)
      .returns(ethers.utils.hexlify([...Array(256)].map((_, i) => i)));

    await expect(
      safeErc20Tester.transfer(sellToken.address, receiver, amount),
    ).to.be.revertedWith("SafeERC20: bad transfer result");
  });
});
