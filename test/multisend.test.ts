import { expect } from "chai";
import { ethers, waffle } from "hardhat";

import { execSafeTransaction } from "../src/tasks/ts/safe";
import { multisend } from "../src/ts/lib/safe";

import { GnosisSafeManager } from "./safe";

describe("multisend", () => {
  const [ethSource, deployer, ...owners] = waffle.provider.getWallets();

  it("sends multiple transactions", async () => {
    const safeManager = await GnosisSafeManager.init(deployer);
    const safe = await safeManager.newSafe(
      owners.map((o) => o.address),
      1,
    );
    await ethSource.sendTransaction({
      value: (await ethers.provider.getBalance(ethSource.address)).div(2),
      to: safe.address,
    });
    const tx = {
      data: "0x",
      operation: 0,
      value: 0x31337,
      to: "0x" + "42".repeat(20),
    };
    const tx2 = {
      data: "0x",
      operation: 0,
      value: 0x1337,
      to: "0x" + "21".repeat(20),
    };
    await execSafeTransaction(
      safe,
      multisend([tx, tx2], safeManager.multisend.address),
      owners,
    );
    expect(await ethers.provider.getBalance("0x" + "42".repeat(20))).to.equal(
      0x31337,
    );
    expect(await ethers.provider.getBalance("0x" + "21".repeat(20))).to.equal(
      0x1337,
    );
  });
});
