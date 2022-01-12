import { Contract } from "@ethersproject/contracts";
import { expect } from "chai";
import hre, { ethers, waffle } from "hardhat";

import {
  metadata,
  prepareSafeDeployment,
  ContractName,
  RealTokenDeployParams,
  VirtualTokenDeployParams,
} from "../src/ts";

import { setupDeployer } from "./deterministic-deployment";
import { execSafeTransaction, GnosisSafeManager } from "./safe";
import { skipOnCoverage } from "./test-management";

describe("deployment", () => {
  const [ethSource, deployer, ...owners] = waffle.provider.getWallets();
  const totalSupply = 1;
  let safeManager: GnosisSafeManager;
  let safe: Contract;

  const realTokenDeployParams: RealTokenDeployParams = {
    totalSupply,
    cowDao: "0x" + "ca1f0000" + "42".repeat(16),
  };
  const virtualTokenDeployParams: Omit<VirtualTokenDeployParams, "realToken"> =
    {
      merkleRoot: "0x" + "42".repeat(32),
      communityFundsTarget: "0x" + "42".repeat(3).padEnd(38, "0") + "01",
      investorFundsTarget: "0x" + "42".repeat(3).padEnd(38, "0") + "02",
      usdcToken: "0x" + "42".repeat(3).padEnd(38, "0") + "03",
      usdcPrice: 42,
      gnoToken: "0x" + "42".repeat(3).padEnd(38, "0") + "04",
      gnoPrice: 1337,
      wethToken: "0x" + "42".repeat(3).padEnd(38, "0") + "05",
      wethPrice: 31337,
      teamController: "0x" + "42".repeat(3).padEnd(38, "0") + "06",
      startTimestamp: 0,
    };
  let currentSnapshot: unknown;

  before(async () => {
    await setupDeployer(ethSource);
    safeManager = await GnosisSafeManager.init(deployer);
  });

  beforeEach(async () => {
    // The state of the blockchain is not getting reverted between tests. This
    // is particularly important for testing deterministic deployments, as
    // contracts are deployed to the same address.
    currentSnapshot = await hre.network.provider.request({
      method: "evm_snapshot",
      params: [],
    });

    safe = await safeManager.newSafe(
      owners.map((o) => o.address),
      2,
    );
  });

  afterEach(async () => {
    await hre.network.provider.request({
      method: "evm_revert",
      params: [currentSnapshot],
    });
  });

  it("performed from a Gnosis Safe", async () => {
    const {
      realTokenDeployTransaction,
      virtualTokenDeployTransaction,
      realTokenAddress,
      virtualTokenAddress,
    } = await prepareSafeDeployment(
      realTokenDeployParams,
      virtualTokenDeployParams,
      safeManager.multisend.address,
      hre.ethers,
    );

    expect(
      await ethers.provider.getCode(safeManager.multisend.address),
    ).to.not.equal("0x");
    expect(await ethers.provider.getCode(realTokenAddress)).to.equal("0x");
    expect(await ethers.provider.getCode(virtualTokenAddress)).to.equal("0x");

    const deploymentReal = await execSafeTransaction(
      safe,
      realTokenDeployTransaction,
      owners,
    );
    await expect(deploymentReal).to.emit(safe, "ExecutionSuccess");
    expect(await ethers.provider.getCode(realTokenAddress)).not.to.equal("0x");

    const deploymentVirtual = await execSafeTransaction(
      safe,
      virtualTokenDeployTransaction,
      owners,
    );
    await expect(deploymentVirtual).to.emit(safe, "ExecutionSuccess");
    expect(await ethers.provider.getCode(virtualTokenAddress)).not.to.equal(
      "0x",
    );

    const real = await hre.ethers.getContractAt(
      ContractName.RealToken,
      realTokenAddress,
    );
    const virtual = await hre.ethers.getContractAt(
      ContractName.VirtualToken,
      virtualTokenAddress,
    );
    expect(await real.symbol()).to.equal(metadata.real.symbol);
    expect(await virtual.symbol()).to.equal(metadata.virtual.symbol);
  });

  it("does not require too much gas [skip-in-coverage]", async function () {
    skipOnCoverage.call(this);

    const { realTokenDeployTransaction, virtualTokenDeployTransaction } =
      await prepareSafeDeployment(
        realTokenDeployParams,
        virtualTokenDeployParams,
        safeManager.multisend.address,
        hre.ethers,
      );

    const deploymentReal = await execSafeTransaction(
      safe,
      realTokenDeployTransaction,
      owners,
    );
    expect(deploymentReal.gasLimit.toNumber()).to.be.lessThan(15_000_000);
    const deploymentVirtual = await execSafeTransaction(
      safe,
      virtualTokenDeployTransaction,
      owners,
    );
    expect(deploymentVirtual.gasLimit.toNumber()).to.be.lessThan(15_000_000);
  });

  describe("deployment parameters", function () {
    let realToken: Contract;
    let virtualToken: Contract;

    beforeEach(async function () {
      const {
        realTokenDeployTransaction,
        virtualTokenDeployTransaction,
        realTokenAddress,
        virtualTokenAddress,
      } = await prepareSafeDeployment(
        realTokenDeployParams,
        virtualTokenDeployParams,
        safeManager.multisend.address,
        hre.ethers,
      );
      await execSafeTransaction(safe, realTokenDeployTransaction, owners);
      await execSafeTransaction(safe, virtualTokenDeployTransaction, owners);

      realToken = await hre.ethers.getContractAt(
        ContractName.RealToken,
        realTokenAddress,
      );
      virtualToken = await hre.ethers.getContractAt(
        ContractName.VirtualToken,
        virtualTokenAddress,
      );
    });

    describe("real token", function () {
      it("totalSupply", async function () {
        expect(await realToken.totalSupply()).to.equal(
          realTokenDeployParams.totalSupply,
        );
      });

      it("cowDao", async function () {
        expect(
          await realToken.balanceOf(realTokenDeployParams.cowDao),
        ).not.to.equal(0);
      });
    });

    describe("virtual token", function () {
      it("merkleRoot", async function () {
        expect(await virtualToken.merkleRoot()).to.equal(
          virtualTokenDeployParams.merkleRoot,
        );
      });

      it("realToken", async function () {
        expect(await virtualToken.cowToken()).to.equal(realToken.address);
      });

      it("communityFundsTarget", async function () {
        expect(await virtualToken.communityFundsTarget()).to.equal(
          virtualTokenDeployParams.communityFundsTarget,
        );
      });

      it("usdcToken", async function () {
        expect(await virtualToken.usdcToken()).to.equal(
          virtualTokenDeployParams.usdcToken,
        );
      });

      it("usdcPrice", async function () {
        expect(await virtualToken.usdcPrice()).to.equal(
          virtualTokenDeployParams.usdcPrice,
        );
      });

      it("gnoToken", async function () {
        expect(await virtualToken.gnoToken()).to.equal(
          virtualTokenDeployParams.gnoToken,
        );
      });

      it("gnoPrice", async function () {
        expect(await virtualToken.gnoPrice()).to.equal(
          virtualTokenDeployParams.gnoPrice,
        );
      });

      it("wethToken", async function () {
        expect(await virtualToken.wethToken()).to.equal(
          virtualTokenDeployParams.wethToken,
        );
      });

      it("wethPrice", async function () {
        expect(await virtualToken.wethPrice()).to.equal(
          virtualTokenDeployParams.wethPrice,
        );
      });

      it("teamController", async function () {
        expect(await virtualToken.teamController()).to.equal(
          virtualTokenDeployParams.teamController,
        );
      });
    });
  });
});
