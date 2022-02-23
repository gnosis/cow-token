import { promises as fs } from "fs";

import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { generateMakeSwappableProposal, MakeSwappableSettings } from "../ts";
import { realityModule as realityModuleAddress } from "../ts/lib/constants";

import { getSnapshotTransactionHashes } from "./ts/snapshot";

const OUTPUT_FOLDER = "./output/make-swappable";

interface Args {
  settings: string;
}

const setupMakeSwappableTask: () => void = () => {
  task(
    "make-swappable",
    "Generate the steps that need to be proposed to the CoW DAO in order to make the vCOW token swappable to COW",
  )
    .addParam(
      "settings",
      "Path to the JSON file that contains the deployment settings.",
    )
    .setAction(makeSwappable);
};

export { setupMakeSwappableTask };

async function makeSwappable(
  { settings: settingsJson }: Args,
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  const chainIdUntyped = (
    await hre.ethers.provider.getNetwork()
  ).chainId.toString();
  if (!["1", "4", "100"].includes(chainIdUntyped)) {
    throw new Error(`Chain id ${chainIdUntyped} not supported`);
  }
  const chainId = chainIdUntyped as "1" | "4" | "100";

  console.log("Processing input files...");
  // TODO: validate settings
  const settings: MakeSwappableSettings = JSON.parse(
    await fs.readFile(settingsJson, "utf8"),
  );

  const { steps } = await generateMakeSwappableProposal(settings, hre.ethers);

  let txHashes = null;
  if (Object.keys(realityModuleAddress).includes(chainId)) {
    console.log("Generating proposal transaction hashes...");
    txHashes = await getSnapshotTransactionHashes(
      steps,
      settings.mainnet.multisend,
      chainId as keyof typeof realityModuleAddress,
      hre.ethers.provider,
    );
  }

  console.log("Clearing old files...");
  await fs.rm(`${OUTPUT_FOLDER}/steps.json`, { recursive: true, force: true });
  await fs.rm(`${OUTPUT_FOLDER}/txhashes.json`, {
    recursive: true,
    force: true,
  });

  console.log("Saving generated data to file...");
  await fs.mkdir(OUTPUT_FOLDER, { recursive: true });
  await fs.writeFile(
    `${OUTPUT_FOLDER}/steps.json`,
    JSON.stringify(steps, undefined, 2),
  );
  if (txHashes !== null) {
    await fs.writeFile(
      `${OUTPUT_FOLDER}/txhashes.json`,
      JSON.stringify(txHashes, undefined, 2),
    );
  }
}
