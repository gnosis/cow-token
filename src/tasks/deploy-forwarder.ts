import type { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { constants } from "ethers";
import { task, types } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  ContractName,
  DEPLOYER_CONTRACT,
  getDeterministicDeploymentTransaction,
} from "../ts";

interface Args {
  salt: string;
}

const setupDeployForwarder: () => void = () => {
  task(
    "deploy-forwarder",
    "Deploys the transaction forwarder on the chosen network.",
  )
    .addOptionalParam(
      "salt",
      "The salt to use for the deterministic deployment.",
      constants.HashZero,
      types.string,
    )
    .setAction(deployForwarder);
};
export { setupDeployForwarder };

async function deployForwarder(
  { salt }: Args,
  hre: HardhatRuntimeEnvironment & { ethers: HardhatEthersHelpers },
) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  console.log(`Using deployer ${deployer.address}`);

  if ((await ethers.provider.getCode(DEPLOYER_CONTRACT)) === "0x") {
    // Note: it is already deployed on mainnet, Rinkeby and Gnosis Chain.
    throw new Error(
      `Deterministic deployer not available on network ${hre.network.name}. Please deploy it first.`,
    );
  }

  const { safeTransaction, address } =
    await getDeterministicDeploymentTransaction(
      ContractName.Forwarder,
      {},
      ethers,
      salt,
    );

  if ((await ethers.provider.getCode(address)) !== "0x") {
    throw new Error(`Contract already deployed at address ${address}`);
  }

  console.log(`Contract will be deployed at address ${address}`);
  const request = await deployer.sendTransaction({
    to: safeTransaction.to,
    data: safeTransaction.data,
  });
  console.log(`Sent deployment transaction, txhash ${request.hash}`);
  await request.wait();
  console.log("Deployment transaction successfully included in a block.");
}
