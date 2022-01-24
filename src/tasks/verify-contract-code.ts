import type { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { Contract } from "ethers";
import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  constructorInput,
  ContractName,
  getDeployArgsFromRealToken,
  getDeployArgsFromVirtualToken,
} from "../ts";

interface Args {
  virtualTokenAddress: string;
}

const setupVerifyContractCodeTask: () => void = () => {
  task(
    "verify-contract-code",
    "Verify the contract code on the network's block exporer.",
  )
    .addPositionalParam(
      "virtualTokenAddress",
      "The address of the virtual vCOW token.",
    )
    .setAction(verifyContractCode);
};
export { setupVerifyContractCodeTask };

async function verifyContractCode(
  { virtualTokenAddress }: Args,
  hre: HardhatRuntimeEnvironment & { ethers: HardhatEthersHelpers },
) {
  if (hre.network.name === "gnosischain") {
    throw new Error("Blockscout is currently not supported");
  }

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

  console.log(
    `Verifying virtual token contract at address ${virtualToken.address}`,
  );
  await verifyContract(ContractName.VirtualToken, virtualToken, hre);

  const realToken = (
    await hre.ethers.getContractFactory(ContractName.RealToken)
  )
    .attach(await virtualToken.cowToken())
    .connect(hre.ethers.provider);

  console.log(`Verifying real token contract at address ${realToken.address}`);
  await verifyContract(ContractName.RealToken, realToken, hre);
}

async function verifyContract(
  name: ContractName,
  contract: Contract,
  hre: HardhatRuntimeEnvironment & { ethers: HardhatEthersHelpers },
) {
  const deployArgs = await (name === ContractName.RealToken
    ? getDeployArgsFromRealToken
    : getDeployArgsFromVirtualToken)(contract);

  // Note: no need to specify which contract to verify as the plugin detects
  // the right contract automatically.
  // https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#how-it-works
  await hre.run("verify:verify", {
    address: contract.address,
    constructorArguments: constructorInput(name, deployArgs),
  });
}
