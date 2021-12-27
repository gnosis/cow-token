// The ideas for the code in this file come from:
// https://github.com/Zoltu/deterministic-deployment-proxy
// In particular, the constants can be verified by running the code in the repo.

import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import { DEPLOYER_CONTRACT } from "../src/ts";

const DEPLOYER = "0x3fAB184622Dc19b6109349B94811493BF2a45362";
const DEPLOYMENT_TRANSACTION =
  "0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222";
// 100 Gwei gas price * 100000 gas limit
const DEPLOYMENT_COST = BigNumber.from(10)
  .pow(2 + 9 + 5)
  .toString();

export async function setupDeployer(ethSource: Signer) {
  if ((await ethers.provider.getCode(DEPLOYER_CONTRACT)) !== "0x") {
    return;
  }
  await ethSource.sendTransaction({
    value: DEPLOYMENT_COST,
    to: DEPLOYER,
  });
  await ethers.provider.send("eth_sendRawTransaction", [
    DEPLOYMENT_TRANSACTION,
  ]);
  if ((await ethers.provider.getCode(DEPLOYER_CONTRACT)).length === 0) {
    throw new Error("Failed to deploy deterministic deployment contract");
  }
}
