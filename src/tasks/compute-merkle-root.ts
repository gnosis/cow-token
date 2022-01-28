import { task } from "hardhat/config";

import { computeProofs, parseCsvFile } from "../ts";

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

interface Args {
  claims: string;
}

async function computeMerkleRoot({ claims }: Args): Promise<void> {
  const parsedClaims = await parseCsvFile(claims);
  const { merkleRoot } = computeProofs(parsedClaims);
  console.log(merkleRoot);
}

export { setupComputeMerkleRootTask };
