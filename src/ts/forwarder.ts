import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { BigNumber, Bytes, constants, Contract, utils } from "ethers";

import { SafeOperation } from "./lib/safe";

// The default forwarder is the result of deterministically deploying the
// forwarder contract on a network using the default deterministic deployer.
// It is assumed to exist on all networks in which the deployment proposal will
// be executed.
export const DEFAULT_FORWARDER = "0x3E70e80BDCD09eEA9680426C18D0590E3366a9e7";

export interface Transaction {
  to: string;
  data: string;
}

export interface ForwardCallIfNoCodeAtInput {
  addressToTest: string;
  transaction: Transaction;
}
export function getForwardCallIfNoCodeAtInput({
  addressToTest,
  transaction,
}: ForwardCallIfNoCodeAtInput): [string, Bytes, string] {
  return [addressToTest, utils.arrayify(transaction.data), transaction.to];
}

export interface ForwardSafeTransactionInput {
  addressToTest: string;
  transaction: MetaTransaction;
  forwarder: Contract;
}
export function callIfContractExists({
  addressToTest,
  transaction,
  forwarder,
}: ForwardSafeTransactionInput): MetaTransaction {
  if (transaction.operation === SafeOperation.DelegateCall) {
    throw new Error("Forwarder can only forward pure calls");
  }
  if (!BigNumber.from(transaction.value).isZero()) {
    throw new Error("Forwarder cannot forward any ETH value");
  }
  return {
    data: forwarder.interface.encodeFunctionData(
      "forwardCallIfNoCodeAt",
      getForwardCallIfNoCodeAtInput({ addressToTest, transaction: transaction }),
    ),
    to: forwarder.address,
    operation: SafeOperation.Call,
    value: constants.Zero,
  };
}
