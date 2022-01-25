// The ideas for the code in this file come from:
// https://github.com/Zoltu/deterministic-deployment-proxy
// In particular, the constants can be verified by running the code in the repo.

import { Signer } from "ethers";
import { ethers } from "hardhat";

import {
  DEFAULT_FORWARDER,
  ContractName,
  getDeterministicDeploymentTransaction,
  DEPLOYER_CONTRACT,
} from "../src/ts";

export async function setupForwarder(ethSource: Signer) {
  if ((await ethers.provider.getCode(DEFAULT_FORWARDER)) !== "0x") {
    return;
  }
  const { safeTransaction } = await getDeterministicDeploymentTransaction(
    ContractName.Forwarder,
    {},
    ethers,
  );
  if ((await ethers.provider.getCode(safeTransaction.to)) === "0x") {
    throw new Error(
      `Setting up forwarder requires default deterministic deployer to be deployed at ${DEPLOYER_CONTRACT}`,
    );
  }
  await ethSource.sendTransaction({
    data: safeTransaction.data,
    to: safeTransaction.to,
  });
  if ((await ethers.provider.getCode(DEFAULT_FORWARDER)) === "0x") {
    throw new Error("Failed to deterministically deploy forwarder contract");
  }
}
