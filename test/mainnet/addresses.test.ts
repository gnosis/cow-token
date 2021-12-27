import { expect } from "chai";
import { utils } from "ethers";
import hre, { ethers } from "hardhat";

import { DEPLOYER_CONTRACT } from "../../src/ts";

import { forkMainnet, stopMainnetFork } from "./chain-fork";

describe("Mainnet: hardcoded addresses", () => {
  before(async () => {
    await forkMainnet(hre);
  });

  after(async () => {
    await stopMainnetFork(hre);
  });

  it("deterministic deployer", async () => {
    await expect(
      utils.arrayify(await ethers.provider.getCode(DEPLOYER_CONTRACT)),
    ).to.have.length.greaterThan(0);
  });
});
