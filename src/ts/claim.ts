import { BigNumber, constants, utils } from "ethers";

import BalanceTree from "./claim/balance-tree";

export enum ClaimType {
  Airdrop = 0,
  GnoOption = 1,
  UserOption = 2,
  Investor = 3,
  Team = 4,
  Advisor = 5,
}

export interface Claim {
  account: string;
  type: ClaimType;
  claimableAmount: BigNumber;
}

export interface ProvenClaim extends Claim {
  index: number;
  proof: string[];
}

export interface ProvenClaims {
  claims: ProvenClaim[];
  merkleRoot: string;
}

export interface ExecutableClaim extends ProvenClaim {
  claimedAmount: BigNumber;
  value?: BigNumber;
}

// Returns a collision-free identifier for the pair (claim, index).
export function claimHash(
  index: number | BigNumber,
  { account, type, claimableAmount }: Claim,
) {
  return Buffer.from(
    utils
      .solidityKeccak256(
        ["uint256", "uint8", "address", "uint256"],
        [index, type, account, claimableAmount],
      )
      .substr(2),
    "hex",
  );
}

// The list of input values for the `claim` function in the order they are
// expected to be.
const claimInputEntries = [
  "index",
  "type",
  "account",
  "claimableAmount",
  "claimedAmount",
  "proof",
] as const;
type MapIntoExecutableClaim<T> = T extends readonly [infer U, ...infer Rest]
  ? U extends keyof ExecutableClaim
    ? [ExecutableClaim[U], ...MapIntoExecutableClaim<Rest>]
    : never
  : [];
export type ClaimInput = MapIntoExecutableClaim<typeof claimInputEntries>;
// [A, B, C] => [A[], B[], C[]]
type ArrayToVecArray<T> = T extends readonly [infer U, ...infer Rest]
  ? [U[], ...ArrayToVecArray<Rest>]
  : [];
// `claimMany` has the same entries as `claim` in vector form plus an amount
// vector at the end.
export type ClaimManyInput = [...ArrayToVecArray<ClaimInput>, BigNumber[]];

// Returns the exact input to give to the function `claim` in order to submit
// the claim.
export function getClaimInput(claim: ExecutableClaim): ClaimInput {
  return claimInputEntries.map((entry) => claim[entry]) as ClaimInput;
}

// Returns the exact input to give to the function `claimMany` in order to
// submit the claim.
export function getClaimManyInput(claims: ExecutableClaim[]): ClaimManyInput {
  return [
    ...(claimInputEntries.map((entry) =>
      claims.map((claim) => claim[entry]),
    ) as ArrayToVecArray<ClaimInput>),
    claims.map(({ value }) => value ?? constants.Zero),
  ];
}

// Computes a Merkle root hash that identifies all and only input claims, along
// with all information needed by each user to perform the claim.
export function computeProofs(claims: Claim[]): ProvenClaims {
  // Sorting by address so that different claims for the same account are
  // close together in the `claimedBitMap`, so that performing multiple claims
  // in the same transaction touches less storage slots.
  // Keep track of the original index to sort back.
  const sortedClaims = claims
    .map((claim, indexBeforeSorting) => ({ ...claim, indexBeforeSorting }))
    .sort(({ account: lhs }, { account: rhs }) =>
      lhs == rhs ? 0 : lhs.toLowerCase() < rhs.toLowerCase() ? -1 : 1,
    );
  const tree = new BalanceTree(sortedClaims);
  const provenClaims: ProvenClaim[] = sortedClaims
    .map((claim, index) => ({
      ...claim,
      index,
      proof: tree.getProof(index, claim),
    }))
    .sort(
      ({ indexBeforeSorting: lhs }, { indexBeforeSorting: rhs }) => lhs - rhs,
    );
  provenClaims.forEach(
    (claim) =>
      delete (claim as { indexBeforeSorting?: number }).indexBeforeSorting,
  );
  return {
    claims: provenClaims,
    merkleRoot: tree.getHexRoot(),
  };
}
