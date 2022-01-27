import { task } from "hardhat/config";

import { computeProofs, parseCsvFile } from "../ts";
import { Args } from "../ts/lib/common-interfaces";

const setupComputeMerkleRootTask: () => void = () => {
  task(
    "compute-merkle-root",
    "Computes the merkle root for a list of claims from a csv",
  )
    .addParam(
      "claims",
      "Path to the CSV file that contains the list of claims.",
    )
    .setAction(computeMerkleRoot);
};

async function computeMerkleRoot({ claims: claimCsv }: Args): Promise<void> {
  const claims = await parseCsvFile(claimCsv);
  const { merkleRoot } = computeProofs(claims);
  console.log(merkleRoot);
}

export { setupComputeMerkleRootTask };
