import { createReadStream } from "fs";
import type { Readable } from "stream";

import { parse } from "csv-parse";
import { BigNumber } from "ethers";

import { ClaimType, Claim } from "./claim";

// This is the header that is expected from the CSV for the corresponding claim
// type.
export const claimLegend = {
  Airdrop: ClaimType.Airdrop,
  GnoOption: ClaimType.GnoOption,
  UserOption: ClaimType.UserOption,
  Investor: ClaimType.Investor,
  Team: ClaimType.Team,
  Advisor: ClaimType.Advisor,
} as const;
// The header of the column containing the addresses of the claim owner.
const accountLegend = "Account";

export async function parseCsv(stream: Readable): Promise<Claim[]> {
  const result: Claim[] = [];

  const parser = stream.pipe(parse({ columns: true }));
  for await (const line of parser) {
    if (!Object.keys(line).includes(accountLegend)) {
      throw new Error(
        `Each CSV line must specify an account. Found: ${JSON.stringify(line)}`,
      );
    }
    const account = line[accountLegend];
    for (const key of Object.keys(line)) {
      if (Object.keys(claimLegend).includes(key)) {
        const type = claimLegend[key as keyof typeof claimLegend];
        const claimableAmount = BigNumber.from(line[key] || "0");
        if (!claimableAmount.eq(0)) {
          result.push({
            account,
            type,
            claimableAmount,
          });
        }
      }
    }
  }

  return result;
}

export function parseCsvFile(csvPath: string): Promise<Claim[]> {
  return parseCsv(createReadStream(csvPath));
}
