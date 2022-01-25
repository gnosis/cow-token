import { promises as fs } from "fs";

import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  parseCsvFile,
  computeProofs,
  removeSplitClaimFiles,
  splitClaimsAndSaveToFolder,
  generateProposal,
} from "../ts";
import { Args, Settings } from "../ts/lib/common-interfaces";

import { defaultTokens } from "./ts/constants";
import { defaultSafeDeploymentAddresses } from "./ts/safe";

const OUTPUT_FOLDER = "./output/deployment";

const setupDeployment: () => void = () => {
  task(
    "deployment",
    `This script takes a list of user claims and deployment settings and produces:
(1) the transactions that need to be executed from a Gnosis Safe to deploy the Cow DAO and the token contracts onchain, and
(2) a list of all claims with corresponding proof in a format that is easy to handle by the frontend.`,
  )
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
      gnoPrice: inputSettings.virtualCowToken.gnoPrice,
      nativeTokenPrice: inputSettings.virtualCowToken.nativeTokenPrice,
      merkleRoot,
      usdcToken: defaultTokens.usdc[chainId],
      gnoToken: defaultTokens.gno[chainId],
      wrappedNativeToken: defaultTokens.weth[chainId],
    },
  };
  const { steps, addresses } = await generateProposal(
    settings,
    defaultSafeDeploymentAddresses(chainId),
    hre.ethers,
  );

  console.log("Clearing old files...");
  await fs.rm(`${OUTPUT_FOLDER}/addresses.json`, {
    recursive: true,
    force: true,
  });
  await fs.rm(`${OUTPUT_FOLDER}/steps.json`, { recursive: true, force: true });
  await fs.rm(`${OUTPUT_FOLDER}/claims.json`, { recursive: true, force: true });
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
