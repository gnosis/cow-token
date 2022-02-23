import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { generateDeployment, CowDeploymentArgs } from "./ts/deployment";

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
    .setAction((args: CowDeploymentArgs, hre: HardhatRuntimeEnvironment) =>
      generateDeployment(args, hre, OUTPUT_FOLDER),
    );
};

export { setupDeployment };
