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
} from "../ts";

const OUTPUT_FOLDER = "./output/test-claims";

interface Args {
  mnemonic: string;
  userCount: number;
}

const setupTestClaimsTask: () => void = () => {
  task(
    "test-claims",
    "Generate a CSV file containing a pseudorandom list of claims. The signers are generated from a mnemonic.",
  )
    .addParam("mnemonic", "The mnemonic used to generate user addresses.")
    .addOptionalParam(
      "userCount",
      "Random claims will be generated for this amount of users. Their secret key will be generated from the mnemonic.",
      100,
      types.int,
    )
    .setAction(generateTestClaims);
};

export { setupTestClaimsTask };

async function generateTestClaims({
  mnemonic,
  userCount,
}: Args): Promise<void> {
  console.log("Generating user PKs...");
  const users = Array(userCount)
    .fill(null)
    .map((_, i) => {
      process.stdout.cursorTo(0);
      process.stdout.write(`${Math.floor((i * 100) / userCount)}%`);
      return Wallet.fromMnemonic(mnemonic, `m/44'/60'/${i}'/0/0`);
    });
  process.stdout.cursorTo(0);
  const privateKeys: Record<string, string> = {};
  for (const user of users) {
    privateKeys[user.address] = user.privateKey;
  }

  console.log("Generating user claims...");
  const claims = generateClaims(users.map((user) => user.address));

  console.log("Clearing old files...");
  await fs.rm(`${OUTPUT_FOLDER}/private-keys.json`, {
    recursive: true,
    force: true,
  });
  await fs.rm(`${OUTPUT_FOLDER}/claims.csv`, { recursive: true, force: true });

  console.log("Saving generated data to file...");
  await fs.mkdir(OUTPUT_FOLDER, { recursive: true });
  await fs.writeFile(
    `${OUTPUT_FOLDER}/private-keys.json`,
    JSON.stringify(privateKeys),
  );
  await writeCsvToFile(`${OUTPUT_FOLDER}/claims.csv`, claims);
}

function powerSet<T>(set: Set<T>): Set<Set<T>> {
  const values = [...set.values()];
  const result: Set<Set<T>> = new Set();
  for (let i = 0; i < 2 ** values.length; i++) {
    result.add(new Set(values.filter((_, pos) => (i & (1 << pos)) !== 0)));
  }
  return result;
}

export function generateClaims(users: string[]): Claim[] {
  // For every possible configuration of claims, there should be a user with
  // these claims. An example of claim configuration is a user who has three
  // claims: Investor, UserOption, and Airdrop.

  // We filter out impossible configuration, that is a team claim with any other
  // vesting claim. Also, we don't need users without claims.
  const vestingClaimTypes = [
    ClaimType.GnoOption,
    ClaimType.UserOption,
    ClaimType.Investor,
  ];
  const admissibleClaimConfigurations = [...powerSet(new Set(allClaimTypes))]
    .filter(
      (configuration) =>
        !(
          configuration.has(ClaimType.Team) &&
          vestingClaimTypes.some((type) => configuration.has(type))
        ),
    )
    .filter((configuration) => configuration.size !== 0);

  const pseudorandomAmount = (i: number) =>
    BigNumber.from(id(i.toString()))
      .mod(10000)
      .mul(utils.parseUnits("1", metadata.real.decimals));
  return users
    .map((account, i) =>
      Array.from(
        admissibleClaimConfigurations[i % admissibleClaimConfigurations.length],
      ).map((type) => ({
        account,
        claimableAmount: pseudorandomAmount(i),
        type,
      })),
    )
    .flat();
}
