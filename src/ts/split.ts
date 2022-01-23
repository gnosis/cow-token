// The functions in this file are responsible for splitting the list of claims
// into multiple smaller files that are cheaper to load by the frontend.
//
// The code is similar to the code used for the same purpose by Uniswap:
// https://github.com/Uniswap/mrkl-drop-data-chunks/blob/c215bf1e4360205acdc6c154389b10a2f287974d/split.ts

import { promises as fs } from "fs";

import { utils } from "ethers";

import { ClaimType, ProvenClaim } from "./claim";

export type FirstAddress = string;
export type LastAddress = string;
export type AddressChunks = { [address: FirstAddress]: LastAddress };
export type ClaimChunk = Record<string, StringifiedProvenClaim[]>;
export type ClaimChunks = Record<FirstAddress, ClaimChunk>;

export interface StringifiedProvenClaim {
  type: string;
  amount: string;
  index: number;
  proof: string[];
}

export interface SplitClaims {
  addressChunks: AddressChunks;
  claimChunks: ClaimChunks;
}

function* claimsBySortedAddress(
  claims: ProvenClaim[],
): Generator<[string, StringifiedProvenClaim[]], void, undefined> {
  if (claims.length === 0) {
    return;
  }
  const sortedClaims = [...claims].sort(({ account: lhs }, { account: rhs }) =>
    lhs === rhs ? 0 : lhs.toLowerCase() < rhs.toLowerCase() ? -1 : 1,
  );

  let currentUser: string = utils.getAddress(sortedClaims[0].account);
  let currentClaims: StringifiedProvenClaim[] = [];
  for (const claim of sortedClaims) {
    if (currentUser.toLowerCase() !== claim.account.toLowerCase()) {
      yield [currentUser, currentClaims];
      currentUser = claim.account;
      currentClaims = [];
    }
    currentClaims.push({
      proof: claim.proof,
      index: claim.index,
      type: ClaimType[claim.type],
      amount: claim.claimableAmount.toString(),
    });
  }
  yield [currentUser, currentClaims];
}

function* chunkify<T>(
  generator: Generator<T, void, undefined>,
  chunkSize: number,
): Generator<T[], void, undefined> {
  let currentChunk: T[] = [];
  for (const output of generator) {
    if (currentChunk.length < chunkSize) {
      currentChunk.push(output);
    } else {
      yield currentChunk;
      currentChunk = [output];
    }
  }
  yield currentChunk;
}

/**
 * Splits the input claims into cohorts of approximatively the same byte size.
 * Each cohort is identified by the first (lexicographically sorted) address
 * in the cohort. A separate entry links the first address to the last address
 * of the cohort.
 *
 * @param claims The claims to split in distinct chuncks.
 * @param maxCohortSize The appriximate maximum size of a cohort in number of
 * users.
 */
export function* splitClaims(
  claims: ProvenClaim[],
  desiredCohortSize = 70,
): Generator<[[FirstAddress, LastAddress], ClaimChunk], void, undefined> {
  for (const chunk of chunkify(
    claimsBySortedAddress(claims),
    desiredCohortSize,
  )) {
    const firstAddress: string = chunk[0][0].toLowerCase();
    const lastAddress: string = chunk[chunk.length - 1][0].toLowerCase();
    const mappingEntry: [string, string] = [firstAddress, lastAddress];
    const claimChunk = chunk.reduce((collected, [user, claims]) => {
      collected[user.toLowerCase()] = claims;
      return collected;
    }, <ClaimChunk>{});
    yield [mappingEntry, claimChunk];
  }
}

export async function splitClaimsAndSaveToFolder(
  claims: ProvenClaim[],
  path: string,
) {
  const addressChunks: AddressChunks = {};
  const chunksDir = `${path}/chunks`;
  await fs.mkdir(chunksDir);

  for (const [[firstAddress, lastAddress], chunk] of splitClaims(claims)) {
    addressChunks[firstAddress] = lastAddress;
    await fs.writeFile(
      `${chunksDir}/${firstAddress.toLowerCase()}.json`,
      JSON.stringify(chunk),
    );
  }
  await fs.writeFile(`${path}/mapping.json`, JSON.stringify(addressChunks));
}

export async function removeSplitClaimFiles(path: string) {
  await fs.rm(`${path}/mapping.json`, { recursive: true, force: true });
  await fs.rm(`${path}/chunks`, { recursive: true, force: true });
}
