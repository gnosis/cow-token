import { TransactionResponse } from "@ethersproject/abstract-provider";
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { BigNumber, Contract, utils, Wallet } from "ethers";
import hre, { ethers, waffle } from "hardhat";

import { gnosisSafeAt } from "../src/tasks/ts/safe";
import {
  createdProxies,
  prepareDeterministicSafeWithOwners,
  prepareSafeWithOwners,
  getFallbackHandler,
} from "../src/ts/lib/safe";

import { GnosisSafeManager } from "./safe";

use(chaiAsPromised);

const [deployer, creator, ...owners] = waffle.provider.getWallets();

async function safeAddress(
  response: TransactionResponse,
  factory: string,
): Promise<string> {
  const proxies = await createdProxies(response, factory);
  expect(proxies).to.have.length(1);
  return proxies[0];
}

type DeployFunction = (
  owners: Wallet[],
  threshold: number,
) => Promise<[TransactionResponse, GnosisSafeManager]>;

function testSafe(deploy: DeployFunction) {
  describe("standard safe setup", function () {
    const threshold = 2;
    let safe: Contract;
    let gnosisSafeManager: GnosisSafeManager;

    beforeEach(async function () {
      let response;
      [response, gnosisSafeManager] = await deploy(owners, threshold);
      safe = gnosisSafeAt(
        await safeAddress(response, gnosisSafeManager.proxyFactory.address),
      ).connect(ethers.provider);
    });

    it("deploys a safe", async function () {
      expect(await ethers.provider.getCode(safe.address)).not.to.equal("0x");
    });

    it("has expected owners", async function () {
      expect([...(await safe.getOwners())].sort()).to.deep.equal(
        owners.map((w) => w.address).sort(),
      );
    });

    it("has expected threshold", async function () {
      expect(await safe.getThreshold()).to.equal(threshold);
    });

    it("has expected fallback handler", async function () {
      expect(await getFallbackHandler(safe.address, ethers)).to.equal(
        gnosisSafeManager.fallbackHandler.address,
      );
    });
  });
}

describe("Gnosis Safe creation", function () {
  let gnosisSafeManager: GnosisSafeManager;

  before(async function () {
    gnosisSafeManager = await GnosisSafeManager.init(deployer);
  });

  describe("deterministic", function () {
    let currentSnapshot: unknown;

    beforeEach(async () => {
      // The state of the blockchain is not getting reverted between tests. This
      // is particularly important for testing deterministic deployments, as
      // contracts are deployed to the same address.
      currentSnapshot = await hre.network.provider.request({
        method: "evm_snapshot",
        params: [],
      });
    });

    afterEach(async () => {
      await hre.network.provider.request({
        method: "evm_revert",
        params: [currentSnapshot],
      });
    });

    const deploy: DeployFunction = async (
      owners: Wallet[],
      threshold: number,
    ) => {
      expect(owners.length).to.be.greaterThanOrEqual(threshold);
      const { to, data } = await prepareDeterministicSafeWithOwners(
        owners.map((w) => w.address.toLowerCase()),
        threshold,
        gnosisSafeManager.getDeploymentAddresses(),
        utils.id("42"),
        ethers,
      );
      const response = await creator.sendTransaction({ to, data });
      return [response, gnosisSafeManager];
    };

    testSafe(deploy);

    it("deploys at expected address", async function () {
      const threshold = 2;
      const { to, data, address } = await prepareDeterministicSafeWithOwners(
        owners.map((w) => w.address.toLowerCase()),
        threshold,
        gnosisSafeManager.getDeploymentAddresses(),
        utils.id("42"),
        ethers,
      );
      const response = await creator.sendTransaction({ to, data });
      const safe = await safeAddress(
        response,
        gnosisSafeManager.proxyFactory.address,
      );
      expect(address).to.equal(safe);
    });

    it("reverts if deploying the same safe twice", async function () {
      const threshold = 2;
      expect(owners.length).to.be.greaterThanOrEqual(threshold);
      const { to, data, address } = await prepareDeterministicSafeWithOwners(
        owners.map((w) => w.address.toLowerCase()),
        threshold,
        gnosisSafeManager.getDeploymentAddresses(),
        utils.id("42"),
        ethers,
      );
      await creator.sendTransaction({ to, data });
      expect(await ethers.provider.getCode(address)).not.to.equal("0x");
      // Note: since the transaction fails, Hardhat can't estimate the right
      // gas limit to execute the transaction. We specify it manually to a much
      // higher number, but we cap it to the block gas limit to make sure it
      // fits the block.
      const blockGasLimit = (await ethers.provider.getBlock("latest")).gasLimit;
      const gasLimit = BigNumber.from(15_000_000).gt(blockGasLimit)
        ? blockGasLimit
        : BigNumber.from(15_000_000);
      await expect(
        creator.sendTransaction({ to, data, gasLimit }),
      ).to.eventually.be.rejectedWith("Create2 call failed");
    });
  });

  describe("non-deterministic", function () {
    const deploy: DeployFunction = async (
      owners: Wallet[],
      threshold: number,
    ) => {
      expect(owners.length).to.be.greaterThanOrEqual(threshold);
      const { to, data } = prepareSafeWithOwners(
        owners.map((w) => w.address.toLowerCase()),
        threshold,
        gnosisSafeManager.getDeploymentAddresses(),
      );
      const response = await creator.sendTransaction({ to, data });
      return [response, gnosisSafeManager];
    };

    testSafe(deploy);

    it("creates two different safes if executing twice", async function () {
      const threshold = 2;
      expect(owners.length).to.be.greaterThanOrEqual(threshold);
      const { to, data } = prepareSafeWithOwners(
        owners.map((w) => w.address),
        threshold,
        gnosisSafeManager.getDeploymentAddresses(),
      );
      const firstResponse = await creator.sendTransaction({ to, data });
      const firstProxy = await safeAddress(
        firstResponse,
        gnosisSafeManager.proxyFactory.address,
      );
      const secondResponse = await creator.sendTransaction({ to, data });
      const secondProxy = await safeAddress(
        secondResponse,
        gnosisSafeManager.proxyFactory.address,
      );
      expect(firstProxy).not.to.equal(secondProxy);
    });
  });
});
