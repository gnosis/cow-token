import { TransactionResponse } from "@ethersproject/abstract-provider";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Args as ArgsDeployment } from "../ts/lib/common-interfaces";

import { generateDeployment } from "./ts/proposal";
import { execSafeTransaction, gnosisSafeAt } from "./ts/safe";

const OUTPUT_FOLDER = "./output/test-execute-proposal";

interface Args extends ArgsDeployment {
  gnosisDao?: string;
}

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
    .addOptionalParam(
      "gnosisDao",
      "The address of the safe that will execute the transaction. If left unspecified, it will be deployed by the current signer.",
    )
    .setAction(executeProposal);
};

export { setupTestExecuteProposalTask };

async function executeProposal(
  args: Args,
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  const [{ addresses, steps }, settings] = await generateDeployment(
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

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Using deployer ${deployer.address}`);

  const proposalDeployer = args.gnosisDao ?? deployer.address;
  if (settings.gnosisDao !== proposalDeployer) {
    throw new Error(
      `Executing the current proposal would fail because the Gnosis DAO specified in the settings (${settings.gnosisDao}) is not the one used for deploying the transaction (${proposalDeployer}). Please update your settings.`,
    );
  }

  const gnosisDao =
    args.gnosisDao === undefined
      ? null
      : gnosisSafeAt(args.gnosisDao).connect(deployer);

  for (const tx of steps) {
    let response: TransactionResponse;
    if (gnosisDao === null) {
      const { to, data } = tx;
      response = await deployer.sendTransaction({
        to,
        data,
      });
    } else {
      response = await execSafeTransaction(gnosisDao, tx, [deployer]);
    }
    console.log(`Sent transaction ${response.hash}`);
    await response.wait();
  }
}
