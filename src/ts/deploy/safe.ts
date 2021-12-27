import { MetaTransaction, encodeMultiSend } from "@gnosis.pm/safe-contracts";
import MultiSend from "@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json";
import { Contract } from "ethers";

export enum SafeOperation {
  Call = 0,
  DelegateCall = 1,
}

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
