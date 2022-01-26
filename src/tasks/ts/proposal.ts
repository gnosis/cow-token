import { promises as fs } from "fs";

import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  parseCsvFile,
  computeProofs,
  removeSplitClaimFiles,
  splitClaimsAndSaveToFolder,
  generateProposal,
  Proposal,
} from "../../ts";
import { Args, Settings } from "../../ts/lib/common-interfaces";
import { defaultTokens } from "../../ts/lib/constants";

import { defaultSafeDeploymentAddresses } from "./safe";

export async function generateDeployment(
  { claims: claimCsv, settings: settingsJson }: Args,
  hre: HardhatRuntimeEnvironment,
  outputFolder: string,
): Promise<Proposal> {
  const chainIdUntyped = (
    await hre.ethers.provider.getNetwork()
  ).chainId.toString();
  if (!["1", "4", "100"].includes(chainIdUntyped)) {
    throw new Error(`Chain id ${chainIdUntyped} not supported`);
  }
  const chainId = chainIdUntyped as "1" | "4" | "100";

  console.log("Processing input files...");
  // TODO: validate settings
  const inputSettings: Settings = JSON.parse(
    await fs.readFile(settingsJson, "utf8"),
  );
  const claims = await parseCsvFile(claimCsv);

  console.log("Generating Merkle proofs...");
  const { merkleRoot, claims: claimsWithProof } = computeProofs(claims);

  const settings = {
    ...inputSettings,
    virtualCowToken: {
      gnoPrice: inputSettings.virtualCowToken.gnoPrice,
      nativeTokenPrice: inputSettings.virtualCowToken.nativeTokenPrice,
      merkleRoot,
      usdcToken: defaultTokens.usdc[chainId],
      gnoToken: defaultTokens.gno[chainId],
      wrappedNativeToken: defaultTokens.weth[chainId],
    },
  };
  const proposal = await generateProposal(
    settings,
    defaultSafeDeploymentAddresses(chainId),
    hre.ethers,
  );
  const { steps, addresses } = proposal;

  console.log("Clearing old files...");
  await fs.rm(`${outputFolder}/addresses.json`, {
    recursive: true,
    force: true,
  });
  await fs.rm(`${outputFolder}/steps.json`, { recursive: true, force: true });
  await fs.rm(`${outputFolder}/claims.json`, { recursive: true, force: true });
  await removeSplitClaimFiles(outputFolder);

  console.log("Saving generated data to file...");
  await fs.mkdir(outputFolder, { recursive: true });
  await fs.writeFile(
    `${outputFolder}/addresses.json`,
    JSON.stringify(addresses, undefined, 2),
  );
  await fs.writeFile(
    `${outputFolder}/steps.json`,
    JSON.stringify(steps, undefined, 2),
  );
  await fs.writeFile(
    `${outputFolder}/claims.json`,
    JSON.stringify(claimsWithProof),
  );
  await splitClaimsAndSaveToFolder(claimsWithProof, outputFolder);

  return proposal;
}
