import hre from "hardhat";

export async function setTime(timestamp: number): Promise<number> {
  return await hre.ethers.provider.send("evm_setNextBlockTimestamp", [
    timestamp,
  ]);
}

export async function setTimeAndMineBlock(timestamp: number): Promise<number> {
  await setTime(timestamp);
  return await hre.ethers.provider.send("evm_mine", []);
}

export async function mineInOrderInSameBlock(
  txs: (() => Promise<void>)[],
): Promise<void> {
  await deactiveAutomine();
  for (const tx of txs.slice(0, -1)) {
    await tx();
  }
  await activateAutomine();
  await txs[txs.length - 1]();
}

export async function deactiveAutomine(): Promise<void> {
  await hre.network.provider.send("evm_setAutomine", [false]);
}

export async function activateAutomine(): Promise<void> {
  await hre.network.provider.send("evm_setAutomine", [true]);
}
