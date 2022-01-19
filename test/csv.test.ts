import { Readable, Writable } from "stream";

import { expect } from "chai";
import { BigNumber } from "ethers";

import { Claim, ClaimType, parseCsv, writeCsv } from "../src/ts";

describe("CSV parsing", function () {
  it("parses one claim per line", async function () {
    const stream = Readable.from(`Account,UserOption,Airdrop
0x1234,0,1337
0x5678,42,0`);
    const expected: Claim[] = [
      {
        account: "0x1234",
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(1337),
      },
      {
        account: "0x5678",
        type: ClaimType.UserOption,
        claimableAmount: BigNumber.from(42),
      },
    ];
    expect(await parseCsv(stream)).to.deep.equal(expected);
  });

  it("parses multiple claims per line", async function () {
    const stream = Readable.from(`Account,UserOption,Airdrop
0x1234,42,1337`);
    const expected: Claim[] = [
      {
        account: "0x1234",
        type: ClaimType.UserOption,
        claimableAmount: BigNumber.from(42),
      },
      {
        account: "0x1234",
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(1337),
      },
    ];
    expect(await parseCsv(stream)).to.deep.equal(expected);
  });

  it("ignores unnecessary columns", async function () {
    const stream = Readable.from(`Account,Comment,Airdrop
0x1234,this is a comment,1337`);
    const expected: Claim[] = [
      {
        account: "0x1234",
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(1337),
      },
    ];
    expect(await parseCsv(stream)).to.deep.equal(expected);
  });

  it("reads all claim types", async function () {
    const stream = Readable.from(
      "Account,Advisor,Airdrop,GnoOption,Investor,Team,UserOption\n0x1234,1,2,3,4,5,6",
    );
    const expected: Claim[] = [
      [ClaimType.Advisor, 1],
      [ClaimType.Airdrop, 2],
      [ClaimType.GnoOption, 3],
      [ClaimType.Investor, 4],
      [ClaimType.Team, 5],
      [ClaimType.UserOption, 6],
    ].map(([type, i]) => ({
      account: "0x1234",
      type,
      claimableAmount: BigNumber.from(i),
    }));
    expect(await parseCsv(stream)).to.deep.equal(expected);
  });

  it("regards empty entries as no claim", async function () {
    const stream = Readable.from(`Account,UserOption,Airdrop
0x1234,,1337`);
    const expected: Claim[] = [
      {
        account: "0x1234",
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(1337),
      },
    ];
    expect(await parseCsv(stream)).to.deep.equal(expected);
  });
});

async function streamToString(stream: Writable): Promise<string> {
  let result = "";
  return new Promise((resolve) =>
    stream
      .on("data", (data) => (result += data.toString()))
      .on("end", () => resolve(result)),
  );
}

describe("CSV writing", function () {
  it("writes single claims", async function () {
    const claims: Claim[] = [
      {
        account: "0x1234",
        type: ClaimType.UserOption,
        claimableAmount: BigNumber.from(1337),
      },
      {
        account: "0x5678",
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(42),
      },
    ];
    const expected = `Account,Airdrop,GnoOption,UserOption,Investor,Team,Advisor
0x1234,,,1337,,,
0x5678,42,,,,,
`;
    expect(await streamToString(writeCsv(claims))).to.deep.equal(expected);
  });

  it("writes multiple claims for the same user jointly", async function () {
    const claims: Claim[] = [
      {
        account: "0x1234",
        type: ClaimType.UserOption,
        claimableAmount: BigNumber.from(1337),
      },
      {
        account: "0x1234",
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(42),
      },
    ];
    const expected = `Account,Airdrop,GnoOption,UserOption,Investor,Team,Advisor
0x1234,42,,1337,,,
`;
    expect(await streamToString(writeCsv(claims))).to.deep.equal(expected);
  });

  it("throws if there are two claims of the same type for the same user", async function () {
    const claims: Claim[] = [
      {
        account: "0x1234",
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(1337),
      },
      {
        account: "0x1234",
        type: ClaimType.Airdrop,
        claimableAmount: BigNumber.from(42),
      },
    ];
    expect(() => writeCsv(claims)).to.throw(
      Error,
      "Account 0x1234 has more than one claim for the same type. This case is currently not implemented.",
    );
  });
});
