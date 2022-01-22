import { expect } from "chai";
import { BigNumber } from "ethers";

import { allClaimTypes, ClaimType, ProvenClaim } from "../src/ts";
import { ClaimChunk, splitClaims } from "../src/ts/split";

describe("claim splitting", async function () {
  const proof = ["any"];

  it("splits claims", async function () {
    const len = allClaimTypes.length;
    const claims: ProvenClaim[] = [
      {
        account: "0x" + "3".repeat(40),
        type: 3 % len,
        claimableAmount: BigNumber.from(3),
        index: 3,
        proof,
      },
      {
        account: "0x" + "2".repeat(40),
        type: 2 % len,
        claimableAmount: BigNumber.from(2),
        index: 2,
        proof,
      },
      {
        account: "0x" + "5".repeat(40),
        type: 5 % len,
        claimableAmount: BigNumber.from(5),
        index: 5,
        proof,
      },
      {
        account: "0x" + "1".repeat(40),
        type: 1 % len,
        claimableAmount: BigNumber.from(1),
        index: 1,
        proof,
      },
      {
        account: "0x" + "7".repeat(40),
        type: 7 % len,
        claimableAmount: BigNumber.from(7),
        index: 7,
        proof,
      },
      {
        account: "0x" + "4".repeat(40),
        type: 4 % len,
        claimableAmount: BigNumber.from(4),
        index: 4,
        proof,
      },
      {
        account: "0x" + "6".repeat(40),
        type: 6 % len,
        claimableAmount: BigNumber.from(6),
        index: 6,
        proof,
      },
    ];
    const size = 3;
    const result = [...splitClaims(claims, size)];
    const mapping = result.map(([pair]) => pair);
    const chunks = result.map(([, chunk]) => chunk);
    expect(mapping).to.deep.equal([
      ["0x" + "1".repeat(40), "0x" + "3".repeat(40)],
      ["0x" + "4".repeat(40), "0x" + "6".repeat(40)],
      ["0x" + "7".repeat(40), "0x" + "7".repeat(40)],
    ]);
    const expected: ClaimChunk[] = [
      {
        ["0x" + "1".repeat(40)]: [
          { type: ClaimType[1 % len], amount: "1", index: 1, proof },
        ],
        ["0x" + "2".repeat(40)]: [
          { type: ClaimType[2 % len], amount: "2", index: 2, proof },
        ],
        ["0x" + "3".repeat(40)]: [
          { type: ClaimType[3 % len], amount: "3", index: 3, proof },
        ],
      },
      {
        ["0x" + "4".repeat(40)]: [
          { type: ClaimType[4 % len], amount: "4", index: 4, proof },
        ],
        ["0x" + "5".repeat(40)]: [
          { type: ClaimType[5 % len], amount: "5", index: 5, proof },
        ],
        ["0x" + "6".repeat(40)]: [
          { type: ClaimType[6 % len], amount: "6", index: 6, proof },
        ],
      },
      {
        ["0x" + "7".repeat(40)]: [
          { type: ClaimType[7 % len], amount: "7", index: 7, proof },
        ],
      },
    ];
    expect(chunks).to.deep.equal(expected);
  });

  it("joins claims for the same user", async function () {
    const claims: ProvenClaim[] = [
      {
        account: "0x" + "1".repeat(40),
        type: ClaimType.Advisor,
        claimableAmount: BigNumber.from(42),
        index: 42,
        proof,
      },
      {
        account: "0x" + "1".repeat(40),
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(4242),
        index: 4242,
        proof,
      },
      {
        account: "0x" + "2".repeat(40),
        type: ClaimType.GnoOption,
        claimableAmount: BigNumber.from(1337),
        index: 1337,
        proof,
      },
    ];
    const size = 3;
    const result = [...splitClaims(claims, size)];
    const mapping = result.map(([pair]) => pair);
    const chunks = result.map(([, chunk]) => chunk);
    expect(mapping).to.deep.equal([
      ["0x" + "1".repeat(40), "0x" + "2".repeat(40)],
    ]);
    expect(chunks).to.deep.equal([
      {
        ["0x" + "1".repeat(40)]: [
          { type: "Advisor", amount: "42", index: 42, proof },
          { type: "Airdrop", amount: "4242", index: 4242, proof },
        ],
        ["0x" + "2".repeat(40)]: [
          { type: "GnoOption", amount: "1337", index: 1337, proof },
        ],
      },
    ]);
  });

  it("joins same address with different case", async function () {
    const claims: ProvenClaim[] = [
      {
        account: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        type: ClaimType.Advisor,
        claimableAmount: BigNumber.from(42),
        index: 42,
        proof,
      },
      {
        account: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(4242),
        index: 4242,
        proof,
      },
    ];
    const result = [...splitClaims(claims)];
    expect(result).to.deep.equal([
      [
        [
          "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        ],
        {
          ["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]: [
            { type: "Advisor", amount: "42", index: 42, proof },
            { type: "Airdrop", amount: "4242", index: 4242, proof },
          ],
        },
      ],
    ]);
  });

  it("has expected case for mapping", async function () {
    const claims: ProvenClaim[] = [
      {
        account: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        type: ClaimType.Advisor,
        claimableAmount: BigNumber.from(4242),
        index: 4242,
        proof,
      },
    ];
    const result = [...splitClaims(claims)];
    const [[mapping]] = result;
    expect(mapping).to.deep.equal([
      "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    ]);
  });

  it("ordering is not affected by case", async function () {
    const small = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
    const large = "0xAAAaaaaaAaaAaaAaaAAAaAAAAAAaAaaaaaaaaaaf";
    expect(small.toLowerCase() < large.toLowerCase());
    expect(small > large);
    const claims: ProvenClaim[] = [
      {
        account: small,
        type: ClaimType.Advisor,
        claimableAmount: BigNumber.from(42),
        index: 42,
        proof,
      },
      {
        account: large,
        type: ClaimType.Advisor,
        claimableAmount: BigNumber.from(1337),
        index: 1337,
        proof,
      },
    ];
    const result = [...splitClaims(claims, 2)];
    const [[mapping]] = result;
    expect(mapping).to.deep.equal([small, large]);
  });

  it("has expected case for chunk", async function () {
    const claims: ProvenClaim[] = [
      {
        account: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        type: ClaimType.Advisor,
        claimableAmount: BigNumber.from(4242),
        index: 4242,
        proof,
      },
    ];
    const result = [...splitClaims(claims)];
    const [[, chunk]] = result;
    expect(chunk).to.deep.equal({
      ["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]: [
        { type: "Advisor", amount: "4242", index: 4242, proof },
      ],
    });
  });
});
