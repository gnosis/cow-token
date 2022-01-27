import { TransactionResponse } from "@ethersproject/abstract-provider";
import { BigNumber, Contract } from "ethers";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Args as ArgsDeployment } from "../ts/lib/common-interfaces";

import { generateDeployment } from "./ts/proposal";
import { execSafeTransaction, gnosisSafeAt } from "./ts/safe";

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
  args: ArgsDeployment,
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
  console.log();

  const [executor] = await hre.ethers.getSigners();
  console.log(`Using executor ${executor.address}`);

  let gnosisDao: null | Contract = null;
  if (settings.gnosisDao !== executor.address) {
    gnosisDao = gnosisSafeAt(settings.gnosisDao).connect(executor);
    try {
      const owners: string[] = await gnosisDao.getOwners();
      const threshold = BigNumber.from(await gnosisDao.getThreshold());
      if (threshold.gt(1) || !owners.includes(executor.address)) {
        throw new Error(
          `The Gnosis DAO specified in the settings (${settings.gnosisDao}) is not owned by the executor (${executor.address}) with threshold one.`,
        );
      }
    } catch (e) {
      console.error(e);
      throw new Error(
        `This script cannot execute the transaction on target Gnosis DAO ${settings.gnosisDao}.`,
      );
    }
  }

  for (const tx of steps) {
    let response: TransactionResponse;
    if (gnosisDao === null) {
      const { to, data } = tx;
      response = await executor.sendTransaction({
        to,
        data,
      });
    } else {
      response = await execSafeTransaction(gnosisDao, tx, [executor]);
    }
    console.log(`Sent transaction ${response.hash}`);
    await response.wait();
    await sleep(1000);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}