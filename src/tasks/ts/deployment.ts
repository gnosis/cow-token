import { promises as fs } from "fs";

import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  DEFAULT_FORWARDER,
  parseCsvFile,
  computeProofs,
  removeSplitClaimFiles,
  splitClaimsAndSaveToFolder,
  generateDeploymentProposal,
  DeploymentProposal,
  ReducedDeploymentProposalSettings,
} from "../../ts";
import {
  defaultTokens,
  realityModule as realityModuleAddress,
} from "../../ts/lib/constants";

import { defaultSafeDeploymentAddresses } from "./safe";
import { getSnapshotTransactionHashes } from "./snapshot";

export interface CowDeploymentArgs {
  claims: string;
  settings: string;
}

export async function generateDeployment(
  { claims: claimCsv, settings: settingsJson }: CowDeploymentArgs,
  hre: HardhatRuntimeEnvironment,
  outputFolder: string,
): Promise<[DeploymentProposal, ReducedDeploymentProposalSettings]> {
  const chainIdUntyped = (
    await hre.ethers.provider.getNetwork()
  ).chainId.toString();
  if (!["1", "4", "100"].includes(chainIdUntyped)) {
    throw new Error(`Chain id ${chainIdUntyped} not supported`);
  }
  const chainId = chainIdUntyped as "1" | "4" | "100";

  console.log("Processing input files...");
  // TODO: validate settings
  const inputSettings: ReducedDeploymentProposalSettings = JSON.parse(
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
  const proposal = await generateDeploymentProposal(
    settings,
    {
      ...defaultSafeDeploymentAddresses(chainId),
      forwarder: DEFAULT_FORWARDER,
    },
    {
      ...defaultSafeDeploymentAddresses("100"),
      forwarder: DEFAULT_FORWARDER,
    },
    hre.ethers,
  );
  const { steps, addresses } = proposal;

  let txHashes = null;
  if (
    Object.keys(realityModuleAddress).includes(chainId) &&
    settings.multisend !== undefined
  ) {
    console.log("Generating proposal transaction hashes...");
    txHashes = await getSnapshotTransactionHashes(
      steps,
      settings.multisend,
      chainId as keyof typeof realityModuleAddress,
      hre.ethers.provider,
    );
  }

  console.log("Clearing old files...");
  await fs.rm(`${outputFolder}/addresses.json`, {
    recursive: true,
    force: true,
  });
  await fs.rm(`${outputFolder}/steps.json`, { recursive: true, force: true });
  await fs.rm(`${outputFolder}/txhashes.json`, {
    recursive: true,
    force: true,
  });
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
  if (txHashes !== null) {
    await fs.writeFile(
      `${outputFolder}/txhashes.json`,
      JSON.stringify(txHashes, undefined, 2),
    );
  }
  await fs.writeFile(
    `${outputFolder}/claims.json`,
    JSON.stringify(claimsWithProof),
  );
  await splitClaimsAndSaveToFolder(claimsWithProof, outputFolder);

  return [proposal, settings];
}
