import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20Metadata.json";
import { expect } from "chai";
import { Contract, utils } from "ethers";
import hre, { ethers } from "hardhat";

import { defaultTokens } from "../../src/tasks/ts/constants";
import { DEPLOYER_CONTRACT } from "../../src/ts";

import { forkMainnet, stopMainnetFork } from "./chain-fork";

const MAINNET_CHAIN_ID = 1;

describe("Mainnet: hardcoded addresses", () => {
  before(async () => {
    await forkMainnet(hre);
  });

  after(async () => {
    await stopMainnetFork(hre);
  });

  it("deterministic deployer", async function () {
    await expect(
      utils.arrayify(await ethers.provider.getCode(DEPLOYER_CONTRACT)),
    ).to.have.length.greaterThan(0);
  });

  it("tokens", async function () {
    const token = (address: string) =>
      new Contract(address, IERC20.abi).connect(ethers.provider);
    await expect(
      await token(defaultTokens.usdc[MAINNET_CHAIN_ID]).symbol(),
    ).to.equal("USDC");
    await expect(
      await token(defaultTokens.weth[MAINNET_CHAIN_ID]).symbol(),
    ).to.equal("WETH");
    await expect(
      await token(defaultTokens.gno[MAINNET_CHAIN_ID]).symbol(),
    ).to.equal("GNO");
  });
});
