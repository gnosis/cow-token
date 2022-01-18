import type { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { BigNumber, Contract } from "ethers";
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
  totalSupply?: string;
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
    .addOptionalParam(
      "totalSupply",
      "The total supply of the real token. If omitted, the current total supply will be used. This parameter needs to be set if the inflation function has already been called.",
    )
    .setAction(verifyContractCode);
};
export { setupVerifyContractCodeTask };

async function verifyContractCode(
  { virtualTokenAddress, totalSupply }: Args,
  hre: HardhatRuntimeEnvironment & { ethers: HardhatEthersHelpers },
) {
  if (hre.network.name === "xdai") {
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
  try {
    await verifyContract(ContractName.RealToken, realToken, hre, {
      totalSupply:
        totalSupply === undefined ? undefined : BigNumber.from(totalSupply),
    });
  } catch (error) {
    console.error(error);
    throw new Error(
      `Failed to verify real contract.${
        totalSupply
          ? ""
          : " Try to specify the initial total supply with --totalSupply"
      }`,
    );
  }
}

interface InputDeployParams {
  totalSupply?: BigNumber | undefined;
}

async function verifyContract(
  name: ContractName,
  contract: Contract,
  hre: HardhatRuntimeEnvironment & { ethers: HardhatEthersHelpers },
  { totalSupply }: InputDeployParams = {},
) {
  const deployArgs =
    name === ContractName.RealToken
      ? {
          ...(await getDeployArgsFromRealToken(contract)),
          totalSupply: totalSupply ?? (await contract.totalSupply()),
        }
      : await getDeployArgsFromVirtualToken(contract);

  // Note: no need to specify which contract to verify as the plugin detects
  // the right contract automatically.
  // https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#how-it-works
  await hre.run("verify:verify", {
    address: contract.address,
    constructorArguments: constructorInput(name, deployArgs),
  });
}
