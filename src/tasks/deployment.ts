import { promises as fs } from "fs";

import { BigNumber, utils, Wallet } from "ethers";
import { id } from "ethers/lib/utils";
import { task, types } from "hardhat/config";

import {
  metadata,
  Claim,
  ClaimType,
  allClaimTypes,
  writeCsvToFile,
  parseCsvFile,
  computeProofs,
} from "../ts";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  DeploymentProposalSettings,
  generateDeploymentProposal,
} from "../ts/proposal";
import { removeSplitClaimFiles, splitClaimsAndSaveToFolder } from "../ts/split";
import { defaultSafeDeploymentAddresses } from "./ts/safe";
import { defaultTokens } from "./ts/constants";

const OUTPUT_FOLDER = "./output/deployment";

interface Args {
  claims: string;
  settings: string;
}

interface VirtualTokenSettings {
  gnoPrice: string;
  nativeTokenPrice: string;
}

interface Settings extends Omit<DeploymentProposalSettings, "virtualCowToken"> {
  virtualCowToken: VirtualTokenSettings;
}

const setupDeployment: () => void = () => {
  task("deployment", "This script prepares .")
    .addParam(
      "claims",
      "Path to the CSV file that contains the list of claims to generate.",
    )
    .addParam(
      "settings",
      "Path to the JSON file that contains the deployment settings.",
    )
    .setAction(generateDeployment);
};

export { setupDeployment };

async function generateDeployment(
  { claims: claimCsv, settings: settingsJson }: Args,
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  const chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();
  if (chainId !== "1") {
    throw new Error(
      `This script must be run on mainnet. Found chainid ${chainId}`,
    );
  }

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
      ...inputSettings.virtualCowToken,
      merkleRoot,
      usdcToken: defaultTokens.usdc[chainId],
      gnoToken: defaultTokens.gno[chainId],
      wrappedNativeToken: defaultTokens.weth[chainId],
    },
  };
  const { steps, addresses } = await generateDeploymentProposal(
    settings,
    defaultSafeDeploymentAddresses(chainId),
    hre.ethers,
  );

  console.log("Clearing old files...");
  await fs.rm(`${OUTPUT_FOLDER}/claims.json`, { recursive: true, force: true });
  await fs.rm(`${OUTPUT_FOLDER}/params.json`, { recursive: true, force: true });
  await removeSplitClaimFiles(OUTPUT_FOLDER);

  console.log("Saving generated data to file...");
  await fs.mkdir(OUTPUT_FOLDER, { recursive: true });
  await fs.writeFile(
    `${OUTPUT_FOLDER}/addresses.json`,
    JSON.stringify(addresses, undefined, 2),
  );
  await fs.writeFile(
    `${OUTPUT_FOLDER}/steps.json`,
    JSON.stringify(steps, undefined, 2),
  );
  await fs.writeFile(
    `${OUTPUT_FOLDER}/claims.json`,
    JSON.stringify(claimsWithProof),
  );
  await splitClaimsAndSaveToFolder(claimsWithProof, OUTPUT_FOLDER);
}
