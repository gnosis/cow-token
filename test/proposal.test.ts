import { TransactionResponse } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";
import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";

import sampleSettings from "../example/settings.json";
import { execSafeTransaction, gnosisSafeAt } from "../src/tasks/ts/safe";
import {
  ContractName,
  getDeployArgsFromRealToken,
  getDeployArgsFromVirtualToken,
  metadata,
  RealTokenDeployParams,
  VirtualTokenDeployParams,
  DeploymentProposalSettings,
  FinalAddresses,
  generateProposal,
  SafeCreationSettings,
  VirtualTokenCreationSettings,
} from "../src/ts";
import { Settings } from "../src/ts/lib/common-interfaces";
import {
  contractsCreatedWithCreateCall,
  getFallbackHandler,
} from "../src/ts/lib/safe";

import { setupDeployer as setupDeterministicDeployer } from "./deterministic-deployment";
import { GnosisSafeManager } from "./safe";
import { stringify } from "./utils/formatUtils";

const [deployer, gnosisDaoOwner, executor] = waffle.provider.getWallets();

// Test at compile time that the example file has the expected format.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeCheck: Settings = sampleSettings;

describe("proposal", function () {
  let currentSnapshot: unknown;
  let forwarder: Contract;
  let gnosisSafeManager: GnosisSafeManager;

  const cowDaoSettings: SafeCreationSettings = {
    owners: [1, 2, 3, 4, 5].map((i) => "0x".padEnd(42, i.toString())),
    threshold: 5,
  };
  const teamConrollerSettings: SafeCreationSettings = {
    owners: [6, 7, 8].map((i) => "0x".padEnd(42, i.toString())),
    threshold: 2,
  };
  const virtualTokenCreationSettings: VirtualTokenCreationSettings = {
    merkleRoot: "0x" + "42".repeat(32),
    usdcToken: "0x0000" + "42".repeat(17) + "01",
    gnoToken: "0x0000" + "42".repeat(17) + "02",
    gnoPrice: "31337",
    wrappedNativeToken: "0x0000" + "42".repeat(17) + "03",
    nativeTokenPrice: "42424242",
  };
  const settings: DeploymentProposalSettings = {
    cowDao: cowDaoSettings,
    teamController: teamConrollerSettings,
    cowToken: {},
    virtualCowToken: virtualTokenCreationSettings,
    bridge: { multiTokenMediatorGnosisChain: "0x" + "01".repeat(20) },
  };

  before(async function () {
    await setupDeterministicDeployer(deployer);
    forwarder = await (
      await ethers.getContractFactory(ContractName.Forwarder, deployer)
    ).deploy();
    gnosisSafeManager = await GnosisSafeManager.init(deployer);
  });

  beforeEach(async function () {
    // Revert the state of the blockchain to clear deterministically deployed
    // contracts.
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

  describe("deploys expected contracts", function () {
    let gnosisDao: Contract;
    let contracts: Record<keyof FinalAddresses | "virtualCowToken", Contract>;

    before(async function () {
      const { steps, addresses } = await generateProposal(
        settings,
        {
          ...gnosisSafeManager.getDeploymentAddresses(),
          forwarder: forwarder.address,
        },
        hre.ethers,
      );

      gnosisDao = await (
        await gnosisSafeManager.newSafe([gnosisDaoOwner.address], 1)
      ).connect(executor);

      let lastResponse: TransactionResponse;
      for (const step of steps) {
        lastResponse = await execSafeTransaction(gnosisDao, step, [
          gnosisDaoOwner,
        ]);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(lastResponse!).not.to.be.undefined;

      const proxies = await contractsCreatedWithCreateCall(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        lastResponse!,
        gnosisSafeManager.createCall.address,
      );
      expect(proxies).to.have.length(1);

      contracts = {
        cowDao: gnosisSafeAt(addresses.cowDao).connect(hre.ethers.provider),
        investorFundsTarget: gnosisSafeAt(
          addresses.investorFundsTarget,
        ).connect(hre.ethers.provider),
        teamController: gnosisSafeAt(addresses.teamController).connect(
          hre.ethers.provider,
        ),
        cowToken: await hre.ethers.getContractAt(
          ContractName.RealToken,
          addresses.cowToken,
        ),
        virtualCowToken: (
          await hre.ethers.getContractFactory(ContractName.VirtualToken)
        )
          .attach(proxies[0])
          .connect(hre.ethers.provider),
      };
    });

    it("has code at expected addresses", async function () {
      for (const [name, contract] of Object.entries(contracts)) {
        expect(
          await hre.ethers.provider.getCode(contract.address),
        ).not.to.equal("0x", `Code for ${name} not found`);
      }
    });

    describe("safes have expected setup", function () {
      it("cowDao", async function () {
        expect(await contracts.cowDao.getOwners()).to.deep.equal(
          settings.cowDao.owners,
        );
        expect(await contracts.cowDao.getThreshold()).to.equal(
          settings.cowDao.threshold,
        );
        expect(
          await getFallbackHandler(contracts.cowDao.address, hre.ethers),
        ).to.equal(gnosisSafeManager.fallbackHandler.address);
      });

      it("teamController", async function () {
        expect(await contracts.teamController.getOwners()).to.deep.equal(
          settings.teamController.owners,
        );
        expect(await contracts.teamController.getThreshold()).to.equal(
          settings.teamController.threshold,
        );
        expect(
          await getFallbackHandler(
            contracts.teamController.address,
            hre.ethers,
          ),
        ).to.equal(gnosisSafeManager.fallbackHandler.address);
      });

      it("investorFundsTarget", async function () {
        expect(await contracts.investorFundsTarget.getOwners()).to.deep.equal([
          contracts.cowDao.address,
        ]);
        expect(await contracts.investorFundsTarget.getThreshold()).to.equal(1);
        expect(
          await getFallbackHandler(
            contracts.investorFundsTarget.address,
            hre.ethers,
          ),
        ).to.equal(gnosisSafeManager.fallbackHandler.address);
      });
    });

    describe("real token", function () {
      it("has expected symbol", async function () {
        expect(await contracts.cowToken.symbol()).to.equal(
          metadata.real.symbol,
        );
      });

      it("has expected deployment params", async function () {
        const onchainDeploymentParams = await getDeployArgsFromRealToken(
          contracts.cowToken,
        );
        const totalSupply = await contracts.cowToken.totalSupply();
        const expected: RealTokenDeployParams = {
          cowDao: contracts.cowDao.address,
          initialTokenHolder: contracts.cowDao.address,
          totalSupply: BigNumber.from(10)
            .pow(3 * 3 + metadata.real.decimals)
            .toString(),
        };
        expect(
          stringify({
            ...onchainDeploymentParams,
            totalSupply: totalSupply.toString(),
          }),
        ).to.deep.equal(expected);
      });

      it("has sent COW to the Cow DAO", async function () {
        const totalSupply = await contracts.cowToken.totalSupply();
        expect(
          await contracts.cowToken.balanceOf(contracts.cowDao.address),
        ).to.equal(totalSupply);
      });
    });

    describe("virtual token", function () {
      it("has expected symbol", async function () {
        expect(await contracts.virtualCowToken.symbol()).to.equal(
          metadata.virtual.symbol,
        );
      });

      it("has expected deployment params", async function () {
        const onchainDeploymentParams = await getDeployArgsFromVirtualToken(
          contracts.virtualCowToken,
        );
        const expected: VirtualTokenDeployParams = {
          ...virtualTokenCreationSettings,
          realToken: contracts.cowToken.address,
          communityFundsTarget: contracts.cowDao.address,
          investorFundsTarget: contracts.investorFundsTarget.address,
          usdcPrice: "150000",
          teamController: contracts.teamController.address,
        };
        expect(stringify(onchainDeploymentParams)).to.deep.equal(expected);
      });
    });
  });
});
