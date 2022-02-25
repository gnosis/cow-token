import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

import { ContractName } from "./deploy";
import { prepareBridgingTokens } from "./lib/bridge";
import { SafeOperation } from "./lib/safe";
import { JsonMetaTransaction, transformMetaTransaction } from "./proposal";

export interface TransferSettings {
  virtualCowToken: string;
  atomsToTransfer: string;
}
export interface MakeSwappableSettings extends TransferSettings {
  bridged: TransferSettings;
  multiTokenMediator: string;
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
  const mainnetMakeSwappableTx = await makeVcowSwappable(settings, ethers);

  const { approve: approveCowBridgingTx, relay: relayToOmniBridgeTx } =
    await prepareBridgingTokens({
      token: settings.cowToken,
      receiver: settings.bridged.virtualCowToken,
      atoms: settings.bridged.atomsToTransfer,
      multiTokenMediator: settings.multiTokenMediator,
      ethers,
    });

  return {
    steps: [
      [mainnetMakeSwappableTx, approveCowBridgingTx, relayToOmniBridgeTx],
    ].map((step) => step.map(transformMetaTransaction)),
  };
}

async function makeVcowSwappable(
  {
    cowToken,
    virtualCowToken,
    atomsToTransfer,
  }: TransferSettings & { cowToken: string },
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
