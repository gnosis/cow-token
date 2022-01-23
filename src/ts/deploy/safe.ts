import type { TransactionResponse } from "@ethersproject/abstract-provider";
import { MetaTransaction, encodeMultiSend } from "@gnosis.pm/safe-contracts";
import CreateCall from "@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/CreateCall.sol/CreateCall.json";
import MultiSend from "@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json";
import { BytesLike, constants, Contract, utils } from "ethers";

export enum SafeOperation {
  Call = 0,
  DelegateCall = 1,
}

const createCallIface = new utils.Interface(CreateCall.abi);

export function multisend(
  transactions: MetaTransaction[],
  multisendAddress: string,
): MetaTransaction {
  const multisend = new Contract(multisendAddress, MultiSend.abi);
  const data = multisend.interface.encodeFunctionData("multiSend", [
    encodeMultiSend(transactions),
  ]);
  return {
    to: multisend.address,
    value: 0,
    operation: SafeOperation.DelegateCall,
    data,
  };
}

export function createTransaction(
  deploymentData: BytesLike,
  createCallAddress: string,
) {
  const createCall = new Contract(createCallAddress, CreateCall.abi);
  const value = constants.Zero;
  const data = createCall.interface.encodeFunctionData("performCreate", [
    value,
    deploymentData,
  ]);
  return {
    to: createCall.address,
    value,
    operation: SafeOperation.Call,
    data,
  };
}

export async function contractsCreatedWithCreateCall(
  response: TransactionResponse,
  createCallAddress: string,
): Promise<string[]> {
  const receipt = await response.wait();
  const creationEvents = receipt.logs
    .filter(({ address }) => address === createCallAddress)
    .map((log) => createCallIface.parseLog(log))
    .filter(({ name }) => name === "ContractCreation");
  return creationEvents.map(({ args }) => args.newContract);
}
