import { Bytes, utils } from "ethers";

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
