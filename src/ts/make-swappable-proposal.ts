import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

import { ContractName } from "./deploy";
import { SafeOperation } from "./lib/safe";
import { JsonMetaTransaction, transformMetaTransaction } from "./proposal";

export interface MakeSwappableSettings {
  virtualCowToken: string;
  atomsToTransfer: string;
  cowToken: string;
  multisend: string;
}

export interface MakeSwappableProposal {
  steps: JsonMetaTransaction[][];
}

export async function generateMakeSwappableProposal(
  settings: MakeSwappableSettings,
  ethers: HardhatEthersHelpers,
): Promise<MakeSwappableProposal> {
  const mainnetMakeSwappableTransaction = await makeVcowSwappable(
    settings,
    ethers,
  );
  return {
    steps: [[mainnetMakeSwappableTransaction]].map((step) =>
      step.map(transformMetaTransaction),
    ),
  };
}

async function makeVcowSwappable(
  {
    cowToken,
    virtualCowToken,
    atomsToTransfer,
  }: Pick<
    MakeSwappableSettings,
    "cowToken" | "virtualCowToken" | "atomsToTransfer"
  >,
  ethers: HardhatEthersHelpers,
): Promise<MetaTransaction> {
  const realTokenIface = (
    await ethers.getContractFactory(ContractName.RealToken)
  ).interface;

  return {
    to: cowToken,
    data: realTokenIface.encodeFunctionData("transfer", [
      virtualCowToken,
      atomsToTransfer,
    ]),
    value: 0,
    operation: SafeOperation.Call,
  };
}
