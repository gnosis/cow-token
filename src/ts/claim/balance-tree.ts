// Most of the code in this file is vendored from Uniswap's Merkle distributor:
// https://github.com/Uniswap/merkle-distributor/blob/c3255bfa2b684594ecd562cacd7664b0f18330bf/src/balance-tree.ts
// The main changes from the original file are:
// - Replace explicit `account` and `amount` variables with a custom  `claim`
//   object. This includes changing the function that computes the hash of a
//   claim.
// - Formatting and imports.

import type { BigNumber } from "ethers";

import { Claim, claimHash } from "../claim";

import MerkleTree from "./merkle-tree";

export default class BalanceTree {
  private readonly tree: MerkleTree;
  constructor(balances: Claim[]) {
    this.tree = new MerkleTree(
      balances.map((claim, index) => {
        return BalanceTree.toNode(index, claim);
      }),
    );
  }

  public static verifyProof(
    index: number | BigNumber,
    claim: Claim,
    proof: Buffer[],
    root: Buffer,
  ): boolean {
    let pair = BalanceTree.toNode(index, claim);
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item);
    }

    return pair.equals(root);
  }

  // keccak256(abi.encode(index, ...claim))
  public static toNode(index: number | BigNumber, claim: Claim): Buffer {
    return claimHash(index, claim);
  }

  public getHexRoot(): string {
    return this.tree.getHexRoot();
  }

  // returns the hex bytes32 values of the proof
  public getProof(index: number | BigNumber, claim: Claim): string[] {
    return this.tree.getHexProof(BalanceTree.toNode(index, claim));
  }
}
