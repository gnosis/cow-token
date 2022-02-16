import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20Metadata.json";
import { expect } from "chai";
import { Contract, utils } from "ethers";
import hre, { ethers } from "hardhat";

import { DEPLOYER_CONTRACT } from "../../src/ts";
import { realityModule, defaultTokens } from "../../src/ts/lib/constants";

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
    expect(
      utils.arrayify(await ethers.provider.getCode(DEPLOYER_CONTRACT)),
    ).to.have.length.greaterThan(0);
  });

  it("tokens", async function () {
    const token = (address: string) =>
      new Contract(address, IERC20.abi).connect(ethers.provider);
    expect(await token(defaultTokens.usdc[MAINNET_CHAIN_ID]).symbol()).to.equal(
      "USDC",
    );
    expect(await token(defaultTokens.weth[MAINNET_CHAIN_ID]).symbol()).to.equal(
      "WETH",
    );
    expect(await token(defaultTokens.gno[MAINNET_CHAIN_ID]).symbol()).to.equal(
      "GNO",
    );
  });

  it("reality module", async function () {
    const address = realityModule["1"];
    expect(
      utils.arrayify(await ethers.provider.getCode(address)),
    ).to.have.length.greaterThan(0);

    // This function appears in the DAO module and can be used to as a hint that this is the correct address.
    const abi = ["function getChainId() view returns (uint256)"];
    const contract = new Contract(address, abi, ethers.provider);
    expect(await contract.getChainId()).to.equal(1);
  });
});
