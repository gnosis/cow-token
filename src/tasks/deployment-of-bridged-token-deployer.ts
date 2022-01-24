import { promises as fs } from "fs";

import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  computeProofs,
  parseCsvFile,
  DeploymentHelperDeployParams,
  generateProposal,
  constructorInput,
  ContractName,
} from "../ts";
import { removeSplitClaimFiles, splitClaimsAndSaveToFolder } from "../ts/split";

import { Args, Settings } from "./common-interfaces";
import { defaultTokens } from "./ts/constants";
import { defaultSafeDeploymentAddresses } from "./ts/safe";

export const OUTPUT_FOLDER_GC = "./output/deployment-gc";

const setupBridgedTokenDeployerTask: () => void = () => {
  task(
    "deployment-bridged-token-deployer",
    "Generate the list of claims from a csv and reads settings from json and deploys the bridged token deployer on gnosis chain",
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

async function generateDeployment(
  { claims: claimCsv, settings: settingsJson }: Args,
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  const chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();
  if (chainId !== "100") {
    throw new Error(
      `This script must be run on gnosis chain. Found chainId ${chainId}`,
    );
  }

  const inputSettings: Settings = JSON.parse(
    await fs.readFile(settingsJson, "utf8"),
  );
  console.log(`Using deployer ${deployer.address}`);

  console.log("Reading user claims for gnosis chain from file...");
  const claims = await parseCsvFile(claimCsv);

  console.log("Generating Merkle proofs...");
  const { merkleRoot, claims: claimsWithProof } = computeProofs(claims);

  const settings = {
    ...inputSettings,
    virtualCowToken: {
      gnoPrice: inputSettings.gnoPrice,
      nativeTokenPrice: inputSettings.nativeTokenPriceOnGnosisChain,
      merkleRoot,
      usdcToken: defaultTokens.usdc[chainId],
      gnoToken: defaultTokens.gno[chainId],
      wrappedNativeToken: defaultTokens.weth[chainId],
    },
  };

  const { addresses } = await generateProposal(
    settings,
    defaultSafeDeploymentAddresses(chainId),
    hre.ethers,
  );

  const deploymentHelperParameters: DeploymentHelperDeployParams = {
    foreignToken: addresses.cowToken,
    multiTokenMediatorGnosisChain: settings.multiTokenMediatorGnosisChain,
    merkleRoot,
    communityFundsTarget: addresses.cowDao,
    gnoToken: settings.virtualCowToken.gnoToken,
    gnoPrice: settings.virtualCowToken.gnoPrice,
    nativeTokenPrice: settings.virtualCowToken.nativeTokenPrice,
    wrappedNativeToken: settings.virtualCowToken.wrappedNativeToken,
  };

  const BridgedTokenDeployer = await hre.ethers.getContractFactory(
    "BridgedTokenDeployer",
  );
  const bridgedTokenDeployer = await BridgedTokenDeployer.deploy(
    ...constructorInput(
      ContractName.BridgedTokenDeployer,
      deploymentHelperParameters,
    ),
  );

  console.log("Clearing old files...");
  await fs.rm(`${OUTPUT_FOLDER_GC}/claims.json`, {
    recursive: true,
    force: true,
  });
  await fs.rm(`${OUTPUT_FOLDER_GC}/params.json`, {
    recursive: true,
    force: true,
  });
  await removeSplitClaimFiles(OUTPUT_FOLDER_GC);

  console.log("Saving generated data to file...");
  await fs.mkdir(OUTPUT_FOLDER_GC, { recursive: true });
  await fs.writeFile(
    `${OUTPUT_FOLDER_GC}/addresses.json`,
    JSON.stringify(bridgedTokenDeployer.address, undefined, 2),
  );
  await fs.writeFile(
    `${OUTPUT_FOLDER_GC}/claims.json`,
    JSON.stringify(claimsWithProof),
  );
  await splitClaimsAndSaveToFolder(claimsWithProof, OUTPUT_FOLDER_GC);
}

export { setupBridgedTokenDeployerTask };
