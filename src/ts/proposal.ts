import { MetaTransaction } from "@gnosis.pm/safe-contracts";

import { multisend } from "./lib/safe";

export type JsonMetaTransaction = Record<
  keyof Omit<MetaTransaction, "operation">,
  string
> & { operation: number };

export function transformMetaTransaction(
  tx: MetaTransaction,
): JsonMetaTransaction {
  return { ...tx, value: tx.value.toString() };
}

export function groupMultipleTransactions(
  proposalSteps: MetaTransaction[][],
  multisendAddress: string,
): MetaTransaction[] {
  return proposalSteps.map((transactions) => {
    if (transactions.length === 0) {
      throw new Error("Group contains zero transactions");
    }
    return transactions.length === 1
      ? transactions[0]
      : multisend(transactions, multisendAddress);
  });
}
