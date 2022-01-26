import { TransactionResponse } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";
import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { BigNumber, utils, Signer } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import hre, { artifacts, ethers, waffle } from "hardhat";

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
  DeterministicallyComputedAddress,
  deterministicallyComputedAddresses,
  getDeterministicDeploymentTransaction,
  createTxForBridgedSafeSetup,
  DeploymentAddresses,
  deploymentStepsIntoArray,
  generateProposalAsStruct,
} from "../src/ts";
import { BridgeParameter, Settings } from "../src/ts/lib/common-interfaces";
import { amountToRelay } from "../src/ts/lib/constants";
import { dummyBridgeParameters } from "../src/ts/lib/dummy-instantiation";
import {
  contractsCreatedWithCreateCall,
  getFallbackHandler,
  prepareDeterministicSafeWithOwners,
} from "../src/ts/lib/safe";

import { setupDeployer as setupDeterministicDeployer } from "./deterministic-deployment";
import { GnosisSafeManager } from "./safe";
import { skipOnCoverage } from "./test-management";
import { stringify } from "./utils/formatUtils";

const [deployer, gnosisDaoOwner, executor, ambExecutor] =
  waffle.provider.getWallets();

// Test at compile time that the example file has the expected format.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeCheck: Settings = sampleSettings;

describe("proposal", function () {
  let currentSnapshot: unknown;
  let forwarder: Contract;
  let gnosisSafeManager: GnosisSafeManager;
  let multiTokenMediatorETH: Contract;
  let gnosisDao: Contract;
  let arbitraryMessageBridge: MockContract;
  const messageID = "0x" + "39".repeat(32);

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

  before(async function () {
    await setupDeterministicDeployer(deployer);
    forwarder = await (
      await ethers.getContractFactory(ContractName.Forwarder, deployer)
    ).deploy();
    gnosisSafeManager = await GnosisSafeManager.init(deployer);
    const OmniBridgeTransferSimulator = await ethers.getContractFactory(
      "OmniBridgeTransferSimulator",
    );
    multiTokenMediatorETH = await OmniBridgeTransferSimulator.connect(
      deployer,
    ).deploy();
    const IAMB = await artifacts.readArtifact("IAMB");
    arbitraryMessageBridge = await waffle.deployMockContract(
      deployer,
      IAMB.abi,
    );
    await arbitraryMessageBridge.mock.requireToPassMessage.returns(messageID);

    gnosisDao = await (
      await gnosisSafeManager.newSafe([gnosisDaoOwner.address], 1)
    ).connect(executor);
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
    let settings: DeploymentProposalSettings;
    let contracts: Record<keyof FinalAddresses | "virtualCowToken", Contract>;
    before(async function () {
      const bridgeParameters: BridgeParameter = {
        multiTokenMediatorGnosisChain: "0x" + "01".repeat(20),
        multiTokenMediatorETH: multiTokenMediatorETH.address,
        arbitraryMessageBridgeETH: arbitraryMessageBridge.address,
      };
      settings = {
        gnosisDao: gnosisDao.address,
        cowDao: cowDaoSettings,
        teamController: teamConrollerSettings,
        cowToken: {},
        virtualCowToken: virtualTokenCreationSettings,
        bridge: bridgeParameters,
      };
      const deploymentAddresses = {
        ...gnosisSafeManager.getDeploymentAddresses(),
        forwarder: forwarder.address,
      };
      const { steps, addresses } = await generateProposalAsStruct(
        settings,
        deploymentAddresses,
        deploymentAddresses,
        hre.ethers,
      );

      let virtualTokenCreationTxResponse: TransactionResponse;

      for (const step of deploymentStepsIntoArray(steps)) {
        if (step == steps.virtualCowTokenCreationTransaction) {
          virtualTokenCreationTxResponse = await execSafeTransaction(
            gnosisDao,
            step,
            [gnosisDaoOwner],
          );
        } else {
          await execSafeTransaction(gnosisDao, step, [gnosisDaoOwner]);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(virtualTokenCreationTxResponse!).not.to.be.undefined;

      const proxies = await contractsCreatedWithCreateCall(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        virtualTokenCreationTxResponse!,
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
          initialTokenHolder: gnosisDao.address,
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
        ).to.equal(totalSupply.sub(amountToRelay));
      });

      it("approval has been used in transfer", async function () {
        expect(
          await contracts.cowToken.allowance(
            gnosisDao.address,
            multiTokenMediatorETH.address,
          ),
        ).to.equal(0);
      });
    });

    describe("bridge relay", function () {
      it("has been called on function relayTokens, tokens were transferred", async function () {
        // Usually, one would just test it like this:
        // expect('relayTokens').to.be.calledOnContractWith(multiTokenMediatorETH, [contracts.cowDao.address, settings.cowDao, settings.bridge.amountToRelay]);
        // but unfortunately, hardhat is not yet supporting it.
        // https://github.com/nomiclabs/hardhat/issues/1135
        // Hence, we are testing with custom multiTokenMediatorETH implementation

        const filterTransfers = contracts.cowToken.filters.Transfer(
          gnosisDao.address,
          multiTokenMediatorETH.address,
          null,
        );
        let logs = await contracts.cowToken.queryFilter(
          filterTransfers,
          0,
          "latest",
        );
        expect(logs.length).to.be.equal(1);
        expect(logs[0].args?.value).to.be.equal(amountToRelay);
        const filteringReceiver = multiTokenMediatorETH.filters.Receiver(null);
        logs = await multiTokenMediatorETH.queryFilter(
          filteringReceiver,
          0,
          "latest",
        );
        expect(logs.length).to.be.equal(1);
        expect(logs[0].args).to.deep.equal([contracts.cowDao.address]);
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

  describe("if the following contract is deployed in advance, it still deploys", function () {
    // We set up `earlierDeployment` so that for every deterministically
    // computed address in the proposal we get a way to deterministically deploy
    // that address as well as the expected deployment address.
    // The function will be called in advance to predeploy the contract.
    type DeployTransaction = (signer: Signer) => Promise<void>;
    let earlierDeployments: Record<
      DeterministicallyComputedAddress,
      [string, DeployTransaction]
    >;

    const modifiedSettings: DeploymentProposalSettings = {
      gnosisDao: "0xda" + "00".repeat(19),
      cowDao: { ...cowDaoSettings },
      teamController: { ...teamConrollerSettings },
      cowToken: {},
      virtualCowToken: virtualTokenCreationSettings,
      bridge: dummyBridgeParameters,
    };
    modifiedSettings.cowDao.nonce = utils.hexZeroPad("0x31337", 32);
    modifiedSettings.teamController.nonce = utils.hexZeroPad("0x31337", 32);

    before(async function () {
      // The DAO that executes the proposal must be set as the Gnosis DAO in the
      // settings, otherwise the transaction will revert.
      modifiedSettings.gnosisDao = gnosisDao.address;

      async function deterministicDeploySafe({
        owners,
        threshold,
        nonce,
      }: SafeCreationSettings): Promise<[string, DeployTransaction]> {
        const { to, data, address } = await prepareDeterministicSafeWithOwners(
          owners,
          threshold,
          gnosisSafeManager.getDeploymentAddresses(),
          BigNumber.from(nonce ?? 0),
          ethers,
        );
        return [
          address,
          async function (deployer: Signer) {
            await deployer.sendTransaction({ to, data });
          },
        ];
      }

      async function deterministicDeployCowToken(
        params: Omit<RealTokenDeployParams, "totalSupply">,
      ): Promise<[string, DeployTransaction]> {
        const {
          address,
          safeTransaction: { to, data },
        } = await getDeterministicDeploymentTransaction(
          ContractName.RealToken,
          {
            totalSupply: BigNumber.from(10).pow(3 * 3 + metadata.real.decimals),
            ...params,
          },
          ethers,
        );
        return [
          address,
          async function (deployer: Signer) {
            await deployer.sendTransaction({ to, data });
          },
        ];
      }

      const cowDao = await deterministicDeploySafe(modifiedSettings.cowDao);
      earlierDeployments = {
        cowDao,
        teamController: await deterministicDeploySafe(
          modifiedSettings.teamController,
        ),
        investorFundsTarget: await deterministicDeploySafe({
          threshold: 1,
          owners: [cowDao[0]],
        }),
        cowToken: await deterministicDeployCowToken({
          cowDao: cowDao[0],
          initialTokenHolder: gnosisDao.address,
        }),
      };
    });

    for (const deterministicAddress of deterministicallyComputedAddresses) {
      it(deterministicAddress, async function () {
        const [predeployedAddress, predeploy] =
          earlierDeployments[deterministicAddress];
        expect(await ethers.provider.getCode(predeployedAddress)).to.equal(
          "0x",
        );
        await predeploy(deployer);
        expect(await ethers.provider.getCode(predeployedAddress)).not.to.equal(
          "0x",
        );

        const deploymentAddresses = {
          ...gnosisSafeManager.getDeploymentAddresses(),
          forwarder: forwarder.address,
        };
        const { steps, addresses } = await generateProposal(
          modifiedSettings,
          deploymentAddresses,
          deploymentAddresses,
          hre.ethers,
        );

        // A failure at this step indicates that the current predeploy
        // transaction should be updated as it doesn't deploy the expected
        // contract.
        expect(addresses[deterministicAddress]).to.equal(predeployedAddress);

        for (const step of steps) {
          await expect(execSafeTransaction(gnosisDao, step, [gnosisDaoOwner]))
            .not.to.be.reverted;
        }
      });
    }
  });
});

describe("proposal", function () {
  let gnosisSafeManager: GnosisSafeManager;
  let gnosisDao: Contract;
  let forwarder: Contract;
  let arbitraryMessageBridge: MockContract;
  const messageID = "0x" + "39".repeat(32);

  before(async function () {
    await setupDeterministicDeployer(deployer);

    const ForwardFactory = (
      await ethers.getContractFactory("Forwarder")
    ).connect(deployer);
    forwarder = await ForwardFactory.deploy();

    gnosisSafeManager = await GnosisSafeManager.initDeterministic(deployer);
    const IAMB = await artifacts.readArtifact("IAMB");
    arbitraryMessageBridge = await waffle.deployMockContract(
      deployer,
      IAMB.abi,
    );
    gnosisDao = await (
      await gnosisSafeManager.newSafe([gnosisDaoOwner.address], 1)
    ).connect(executor);
  });
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

  let settings: DeploymentProposalSettings;
  describe("relay of safe deployment", function () {
    let deploymentAddresses: DeploymentAddresses;
    before(async function () {
      const bridgeParameters: BridgeParameter = {
        multiTokenMediatorGnosisChain: "0x" + "01".repeat(20),
        multiTokenMediatorETH: "0x" + "02".repeat(20),
        arbitraryMessageBridgeETH: arbitraryMessageBridge.address,
      };
      settings = {
        gnosisDao: gnosisDao.address,
        cowDao: cowDaoSettings,
        teamController: teamConrollerSettings,
        cowToken: {},
        virtualCowToken: virtualTokenCreationSettings,
        bridge: bridgeParameters,
      };
      deploymentAddresses = {
        ...gnosisSafeManager.getDeploymentAddresses(),
        forwarder: forwarder.address,
      };
    });
    const expectedCowDaoAddress = "0x6a54ef9C6BE1aF4099336C3bDBBDf690d0B67A7c";
    it("has the correct target address", async function () {
      const bridgedGnosisSafeDeployment = await createTxForBridgedSafeSetup(
        expectedCowDaoAddress,
        {
          arbitraryMessageBridgeETH: settings.bridge.arbitraryMessageBridgeETH,
        },
        settings.cowDao,
        deploymentAddresses,
        hre.ethers,
      );
      expect(bridgedGnosisSafeDeployment.to).to.be.equal(
        settings.bridge.arbitraryMessageBridgeETH,
      );
    });
    it("createTxForBridgedSafeSetup calls the bridge correctly on requireToPassMessage", async function () {
      const bridgedGnosisSafeDeployment = await createTxForBridgedSafeSetup(
        expectedCowDaoAddress,
        {
          arbitraryMessageBridgeETH: settings.bridge.arbitraryMessageBridgeETH,
        },
        settings.cowDao,
        deploymentAddresses,
        hre.ethers,
      );
      const functionSignatureBytes = 4;
      const [to, data, gasLimit] = defaultAbiCoder.decode(
        ["address", "bytes", "uint256"],
        utils
          .arrayify(bridgedGnosisSafeDeployment.data)
          .slice(functionSignatureBytes),
      );
      await arbitraryMessageBridge.mock.requireToPassMessage
        .withArgs(to, data, gasLimit)
        .reverts();
      await expect(
        execSafeTransaction(gnosisDao, bridgedGnosisSafeDeployment, [
          gnosisDaoOwner,
        ]),
      ).to.be.reverted;
      await arbitraryMessageBridge.mock.requireToPassMessage
        .withArgs(to, data, gasLimit)
        .returns(messageID);
      await expect(
        execSafeTransaction(gnosisDao, bridgedGnosisSafeDeployment, [
          gnosisDaoOwner,
        ]),
      ).to.not.be.reverted;
    });

    it("fails if address is not correct", async function () {
      await expect(
        createTxForBridgedSafeSetup(
          "0x" + "42".repeat(20),
          {
            arbitraryMessageBridgeETH:
              settings.bridge.arbitraryMessageBridgeETH,
          },
          settings.cowDao,
          deploymentAddresses,
          hre.ethers,
        ),
      ).to.be.rejectedWith(Error);
    });
    it("has the txData that allows to deploy the safe with correct threshold and owners [skip-in-coverage]", async function () {
      // Needs to be skipped in coverage as inserting the artifacts to check lines
      // for coverage changes the bytecode, and with it the final address.
      skipOnCoverage.call(this);
      const bridgedGnosisSafeDeployment = await createTxForBridgedSafeSetup(
        expectedCowDaoAddress,
        {
          arbitraryMessageBridgeETH: settings.bridge.arbitraryMessageBridgeETH,
        },
        settings.cowDao,
        deploymentAddresses,
        hre.ethers,
      );
      expect(
        await hre.ethers.provider.getCode(expectedCowDaoAddress),
      ).to.be.equal("0x");

      const functionSignatureBytes = 4;
      const [to, data, gasLimit] = defaultAbiCoder.decode(
        ["address", "bytes", "uint256"],
        utils
          .arrayify(bridgedGnosisSafeDeployment.data)
          .slice(functionSignatureBytes),
      );

      const tx = {
        from: ambExecutor.address,
        to,
        data,
        gasPrice: 545019933,
        gasLimit,
      };
      const signed = await ambExecutor.signTransaction(tx);
      await hre.ethers.provider.sendTransaction(signed);
      expect(
        await hre.ethers.provider.getCode(expectedCowDaoAddress),
      ).not.to.equal("0x");
      const newSafe = gnosisSafeAt(expectedCowDaoAddress).connect(
        hre.ethers.provider,
      );
      expect(await newSafe.getOwners()).to.deep.equal(settings.cowDao.owners);
      expect(await newSafe.getThreshold()).to.equal(settings.cowDao.threshold);
    });
  });
});
