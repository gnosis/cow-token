import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { BigNumber, Bytes, constants, Contract, utils } from "ethers";

import { SafeOperation } from "./lib/safe";

// The default forwarder is the result of deterministically deploying the
// forwarder contract on a network using the default deterministic deployer.
// It is assumed to exist on all networks in which the deployment proposal will
// be executed.
export const DEFAULT_FORWARDER = "0x1167594438f3314fAB7cbE96F2Bc00db6c9ac8a3";

export interface Transaction {
  to: string;
  data: string;
}

export interface ForwardIfNoCodeAtInput {
  addressToTest: string;
  transaction: Transaction;
}
export function getForwardIfNoCodeAtInput({
  addressToTest,
  transaction,
}: ForwardIfNoCodeAtInput): [string, Bytes, string] {
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
      "forwardIfNoCodeAt",
      getForwardIfNoCodeAtInput({ addressToTest, transaction: transaction }),
    ),
    to: forwarder.address,
    operation: SafeOperation.Call,
    value: constants.Zero,
  };
}
