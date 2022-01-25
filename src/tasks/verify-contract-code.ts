import type { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  constructorInput,
  ContractName,
  DeployParams,
  getDeployArgsFromRealToken,
  getDeployArgsFromVirtualToken,
} from "../ts";

interface Args {
  virtualTokenAddress?: string;
  forwarderAddress?: string;
}

const setupVerifyContractCodeTask: () => void = () => {
  task(
    "verify-contract-code",
    "Verify the contract code on the network's block exporer.",
  )
    .addOptionalParam(
      "virtualTokenAddress",
      "The address of the virtual vCOW token.",
    )
    .addOptionalParam(
      "forwarderAddress",
      "The address of the virtual vCOW token.",
    )
    .setAction(verifyContractCode);
};
export { setupVerifyContractCodeTask };

async function verifyContractCode(
  { virtualTokenAddress, forwarderAddress }: Args,
  hre: HardhatRuntimeEnvironment,
) {
  if (hre.network.name === "xdai") {
    throw new Error("Blockscout is currently not supported");
  }

  if (virtualTokenAddress !== undefined) {
    await verifyVirtualToken(virtualTokenAddress, hre);
  }

  if (forwarderAddress !== undefined) {
    await verifyContract(ContractName.Forwarder, forwarderAddress, hre);
  }
}

async function verifyVirtualToken(
  virtualTokenAddress: string,
  hre: HardhatRuntimeEnvironment,
) {
  // Check that the contract is indeed the virtual token and not another token
  // (as for example the real token).
  const virtualToken = (
    await hre.ethers.getContractFactory(ContractName.VirtualToken)
  )
    .attach(virtualTokenAddress)
    .connect(hre.ethers.provider);
  try {
    const tokenSymbol = await virtualToken.symbol();
    if (tokenSymbol !== "vCOW") {
      throw new Error(
        `The address to verify has a token with symbol ${tokenSymbol}. Expected to verify token vCOW. Please use the address of the virtual COW token instead.`,
      );
    }
  } catch (error) {
    console.error(error);
    throw new Error(
      "Failed to verify token contract code. The input address is not the vCOW token.",
    );
  }

  await verifyContract(ContractName.VirtualToken, virtualToken.address, hre);

  const realTokenAddress = await virtualToken.cowToken();
  await verifyContract(ContractName.RealToken, realTokenAddress, hre);
}

async function verifyContract(
  name: ContractName,
  address: string,
  hre: HardhatRuntimeEnvironment & { ethers: HardhatEthersHelpers },
) {
  console.log(`Verifying contract ${name} at address ${address}`);
  const contract = (await hre.ethers.getContractFactory(name))
    .attach(address)
    .connect(hre.ethers.provider);

  let deployArgs: DeployParams[ContractName];
  switch (name) {
    case ContractName.RealToken: {
      deployArgs = await getDeployArgsFromRealToken(contract);
      break;
    }
    case ContractName.VirtualToken: {
      deployArgs = await getDeployArgsFromVirtualToken(contract);
      break;
    }
    case ContractName.Forwarder: {
      deployArgs = {};
      break;
    }
    default: {
      throw new Error(
        `Contract verification for ${name} is currently not implemented`,
      );
    }
  }

  // Note: no need to specify which contract to verify as the plugin detects
  // the right contract automatically.
  // https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#how-it-works
  await hre.run("verify:verify", {
    address: contract.address,
    constructorArguments: constructorInput(name, deployArgs),
  });
}
