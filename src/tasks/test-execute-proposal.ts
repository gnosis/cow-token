import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Args } from "../ts/lib/common-interfaces";

import { generateDeployment } from "./ts/proposal";

const OUTPUT_FOLDER = "./output/test-execute-proposal";

const setupTestExecuteProposalTask: () => void = () => {
  task(
    "test-execute-proposal",
    `This script generates a proposal (like the deployment script) but also executes all transactions onchain.`,
  )
    .addParam(
      "claims",
      "Path to the CSV file that contains the list of claims to generate.",
    )
    .addParam(
      "settings",
      "Path to the JSON file that contains the deployment settings.",
    )
    .setAction(executeProposal);
};

export { setupTestExecuteProposalTask };

async function executeProposal(
  args: Args,
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  const { addresses, steps } = await generateDeployment(
    args,
    hre,
    OUTPUT_FOLDER,
  );

  console.log(
    "The following deterministic addresses will be deployed by the proposal:",
  );
  console.log(
    Object.entries(addresses)
      .map(([key, address]) => `${key}: ${address}`)
      .join("\n"),
  );

  const [gnosisDao] = await hre.ethers.getSigners();
  console.log(`Using deployer ${gnosisDao.address} as the Gnosis DAO`);

  for (const { to, data } of steps) {
    const response = await gnosisDao.sendTransaction({ to, data });
    console.log(`Sent transaction ${response.hash}`);
    await response.wait();
  }
}
