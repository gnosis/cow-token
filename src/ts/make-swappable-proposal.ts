import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

import { ContractName } from "./deploy";
import { SafeOperation } from "./lib/safe";
import { JsonMetaTransaction, transformMetaTransaction } from "./proposal";

export interface NetworkSpecificMakeSwappableSettings {
  cowToken: string;
  virtualCowToken: string;
  atoms: string;
}

export interface MakeSwappableSettings {
  mainnet: NetworkSpecificMakeSwappableSettings & {
    multisend: string;
  };
}

export interface MakeSwappableProposal {
  steps: JsonMetaTransaction[][];
}

export async function generateMakeSwappableProposal(
  settings: MakeSwappableSettings,
  ethers: HardhatEthersHelpers,
): Promise<MakeSwappableProposal> {
  const mainnetMakeSwappableTransaction = await makeVcowSwappable(
    settings.mainnet,
    ethers,
  );
  return {
    steps: [[mainnetMakeSwappableTransaction]].map((step) =>
      step.map(transformMetaTransaction),
    ),
  };
}

async function makeVcowSwappable(
  { cowToken, virtualCowToken, atoms }: NetworkSpecificMakeSwappableSettings,
  ethers: HardhatEthersHelpers,
): Promise<MetaTransaction> {
  const realTokenIface = (
    await ethers.getContractFactory(ContractName.RealToken)
  ).interface;

  return {
    to: cowToken,
    data: realTokenIface.encodeFunctionData("transfer", [
      virtualCowToken,
      atoms,
    ]),
    value: 0,
    operation: SafeOperation.Call,
  };
}
