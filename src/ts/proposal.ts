import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { BigNumber, Contract, utils } from "ethers";

import {
  getDeterministicDeploymentTransaction,
  getNonDeterministicDeploymentTransaction,
  RealTokenDeployParams,
  VirtualTokenDeployParams,
  ContractName,
} from "./deploy";
import { BridgeParameter } from "./lib/common-interfaces";
import { amountToRelay } from "./lib/constants";
import {
  multisend,
  prepareDeterministicSafeWithOwners,
  SafeDeploymentAddresses,
  SafeOperation,
} from "./lib/safe";
import { metadata } from "./token";

import { callIfContractExists } from ".";

export interface SafeCreationSettings {
  expectedAddress?: string;
  threshold: number;
  owners: string[];
  nonce?: string;
}
export interface RealTokenCreationSettings {
  expectedAddress?: string;
  salt?: string;
}
export interface VirtualTokenCreationSettings {
  merkleRoot: string;
  usdcToken: string;
  gnoToken: string;
  gnoPrice: string;
  wrappedNativeToken: string;
  nativeTokenPrice: string;
}
export interface DeploymentProposalSettings {
  gnosisDao: string;
  cowDao: SafeCreationSettings;
  teamController: SafeCreationSettings;
  cowToken: RealTokenCreationSettings;
  virtualCowToken: VirtualTokenCreationSettings;
  bridge: BridgeParameter;
  bridgedTokenDeployer?: string;
}

export interface DeploymentAddresses extends SafeDeploymentAddresses {
  forwarder: string;
}

export type JsonMetaTransaction = Record<
  keyof Omit<MetaTransaction, "operation">,
  string
> & { operation: number };

export const deterministicallyComputedAddresses = [
  "cowDao",
  "teamController",
  "investorFundsTarget",
  "cowToken",
] as const;
export type DeterministicallyComputedAddress =
  typeof deterministicallyComputedAddresses[number];
export type FinalAddresses = Record<DeterministicallyComputedAddress, string>;

export interface DeploymentSteps {
  cowDaoCreationTransaction: JsonMetaTransaction;
  teamControllerCreationTransaction: JsonMetaTransaction;
  investorFundsTargetCreationTransaction: JsonMetaTransaction;
  cowTokenCreationTransaction: JsonMetaTransaction;
  virtualCowTokenCreationTransaction: JsonMetaTransaction;
  approvalOmniBridgeTx: JsonMetaTransaction;
  relayTestFundsToOmniBridgeTx: JsonMetaTransaction;
  transferCowTokenToCowDao: JsonMetaTransaction;
  relayCowDaoDeployment: JsonMetaTransaction;
  bridgedTokenDeployerTriggering: JsonMetaTransaction;
}
export interface ProposalAsStruct {
  steps: DeploymentSteps;
  addresses: FinalAddresses;
}

export interface Proposal {
  steps: JsonMetaTransaction[][];
  addresses: FinalAddresses;
}

export async function generateProposal(
  settings: DeploymentProposalSettings,
  deploymentAddressesETH: DeploymentAddresses,
  deploymentAddressesGnosisChain: DeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<Proposal> {
  const proposal = await generateProposalAsStruct(
    settings,
    deploymentAddressesETH,
    deploymentAddressesGnosisChain,
    ethers,
  );
  return {
    steps: deploymentStepsIntoArray(proposal.steps),
    addresses: proposal.addresses,
  };
}

export async function generateProposalAsStruct(
  settings: DeploymentProposalSettings,
  deploymentAddressesETH: DeploymentAddresses,
  deploymentAddressesGnosisChain: DeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<ProposalAsStruct> {
  const { address: cowDao, transaction: cowDaoCreationTransaction } =
    await setupDeterministicSafe(
      settings.cowDao,
      deploymentAddressesETH,
      ethers,
    );

  const {
    address: teamController,
    transaction: teamControllerCreationTransaction,
  } = await setupDeterministicSafe(
    settings.teamController,
    deploymentAddressesETH,
    ethers,
  );

  const {
    address: investorFundsTarget,
    transaction: investorFundsTargetCreationTransaction,
  } = await setupDeterministicSafe(
    { owners: [cowDao], threshold: 1 },
    deploymentAddressesETH,
    ethers,
  );

  const totalSupply = BigNumber.from(10).pow(3 * 3 + metadata.real.decimals);
  const realTokenDeployParams: RealTokenDeployParams = {
    cowDao,
    initialTokenHolder: settings.gnosisDao,
    totalSupply,
  };
  const { address: cowToken, transaction: cowTokenCreationTransaction } =
    await setupRealToken(
      settings.cowToken,
      deploymentAddressesETH,
      realTokenDeployParams,
      ethers,
    );

  const virtualTokenDeployParams: VirtualTokenDeployParams = {
    ...settings.virtualCowToken,
    usdcPrice: utils.parseUnits("0.15", 6), // 0.15 USDC for 1 COW. Assumption: USDC has six decimals
    realToken: cowToken,
    communityFundsTarget: cowDao,
    investorFundsTarget,
    teamController,
  };
  const { transaction: virtualCowTokenCreationTransaction } =
    await setupVirtualToken(
      virtualTokenDeployParams,
      deploymentAddressesETH,
      ethers,
    );
  const cowTokenContract = await ethers.getContractAt(
    ContractName.RealToken,
    cowToken,
  );
  const [approvalOmniBridgeTx, relayTestFundsToOmniBridgeTx] =
    await generateBridgeTokenToGnosisChainTx(
      cowTokenContract,
      settings,
      ethers,
      cowDao,
    );

  const transferCowTokenToCowDao = {
    to: cowToken,
    value: "0",
    data: cowTokenContract.interface.encodeFunctionData("transfer", [
      cowDao,
      totalSupply.sub(amountToRelay),
    ]),
    operation: 0,
  };

  // In the following we create the same cowDao safe also on gnosis
  // chain. This works only, because the owners, threshold, the
  // fallback handler, the singleton, the factory are exactly the
  // same with the same addresses on ethereum and gnosis chain.
  if (
    deploymentAddressesETH.singleton !==
      deploymentAddressesGnosisChain.singleton ||
    deploymentAddressesETH.factory !== deploymentAddressesGnosisChain.factory ||
    deploymentAddressesETH.fallbackHandler !==
      deploymentAddressesGnosisChain.fallbackHandler
  ) {
    throw new Error(
      "The safeDeploymentAddress are not the same on the two different networks",
    );
  }
  const relayCowDaoDeployment = await createTxForBridgedSafeSetup(
    cowDao,
    { arbitraryMessageBridgeETH: settings.bridge.arbitraryMessageBridgeETH },
    settings.cowDao,
    deploymentAddressesGnosisChain,
    ethers,
  );

  const bridgedTokenDeployerTriggering =
    await createTxTriggeringBridgedTokenDeployer(
      { arbitraryMessageBridgeETH: settings.bridge.arbitraryMessageBridgeETH },
      settings.bridgedTokenDeployer,
      ethers,
    );

  return {
    steps: {
      cowDaoCreationTransaction: transformMetaTransaction(
        cowDaoCreationTransaction,
      ),
      teamControllerCreationTransaction: transformMetaTransaction(
        teamControllerCreationTransaction,
      ),
      investorFundsTargetCreationTransaction: transformMetaTransaction(
        investorFundsTargetCreationTransaction,
      ),
      cowTokenCreationTransaction: transformMetaTransaction(
        cowTokenCreationTransaction,
      ),
      virtualCowTokenCreationTransaction: transformMetaTransaction(
        virtualCowTokenCreationTransaction,
      ),
      approvalOmniBridgeTx,
      relayTestFundsToOmniBridgeTx,
      transferCowTokenToCowDao,
      relayCowDaoDeployment: transformMetaTransaction(relayCowDaoDeployment),
      bridgedTokenDeployerTriggering: transformMetaTransaction(
        bridgedTokenDeployerTriggering,
      ),
    },
    addresses: {
      cowDao,
      teamController,
      investorFundsTarget,
      cowToken,
    },
  };
}

async function generateBridgeTokenToGnosisChainTx(
  cowTokenContract: Contract,
  settings: DeploymentProposalSettings,
  ethers: HardhatEthersHelpers,
  cowDao: string,
): Promise<JsonMetaTransaction[]> {
  const multiTokenMediator = await ethers.getContractAt(
    "IOmnibridge",
    settings.bridge.multiTokenMediatorETH,
  );
  const approvalOmniBridgeTx = {
    to: cowTokenContract.address,
    value: "0",
    data: cowTokenContract.interface.encodeFunctionData("approve", [
      settings.bridge.multiTokenMediatorETH,
      amountToRelay,
    ]),
    operation: 0,
  };

  const relayTestFundsToOmniBridgeTx = {
    to: settings.bridge.multiTokenMediatorETH,
    value: "0",
    data: multiTokenMediator.interface.encodeFunctionData("relayTokens", [
      cowTokenContract.address,
      cowDao,
      amountToRelay,
    ]),
    operation: 0,
  };
  return [approvalOmniBridgeTx, relayTestFundsToOmniBridgeTx];
}
function transformMetaTransaction(tx: MetaTransaction): JsonMetaTransaction {
  return { ...tx, value: tx.value.toString() };
}
export interface BridgeSettings {
  arbitraryMessageBridgeETH: string;
}
export async function createTxForBridgedSafeSetup(
  cowDaoAddress: string,
  bridgeSettings: BridgeSettings,
  safeSettings: SafeCreationSettings,
  deploymentAddresses: DeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<MetaTransaction> {
  const { transaction, address } = await setupDeterministicSafe(
    safeSettings,
    deploymentAddresses,
    ethers,
  );
  if (address !== cowDaoAddress) {
    throw new Error("unexpected address for cowDao");
  }
  if (
    transaction.operation !== SafeOperation.Call ||
    !BigNumber.from(transaction.value).eq(0)
  ) {
    throw new Error("Transaction not supported by the message bridge.");
  }
  const ambForeign = await ethers.getContractAt(
    "IAMB",
    bridgeSettings.arbitraryMessageBridgeETH,
  );
  const deploySafeDeterministicOnGnosisChain = {
    to: ambForeign.address,
    value: "0",
    data: ambForeign.interface.encodeFunctionData("requireToPassMessage", [
      transaction.to,
      transaction.data,
      1500000, // Max value is 2M on ETH->xDAI bridge, 1.5M should be sufficient for gnosis safe deployment.
    ]),
    operation: 0,
  };
  return deploySafeDeterministicOnGnosisChain;
}

export async function createTxTriggeringBridgedTokenDeployer(
  bridgeSettings: BridgeSettings,
  bridgedTokenDeployerAddress: string | undefined,
  ethers: HardhatEthersHelpers,
): Promise<MetaTransaction> {
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  if (bridgedTokenDeployerAddress == undefined) {
    if (chainId !== "100") {
      throw new Error("Network should have a bridgedTokenDeployer defined");
    } else {
      // This function is called from the generateProposal function. The generateProposal
      // either generates the real proposals or is only used for address calculation on gnosis chain
      // If it is only used for address calculation, then the output of this
      // function is not relevant.
      // Hence, on gnosis chain this bridgedTokenDeployerAddress is not required and
      // we can just set the values to zero.
      // Todo: refactor such that we don't use generateProposals for generating
      // the addresses, and hence avoid this case
      bridgedTokenDeployerAddress = "0x" + "00".repeat(20);
    }
  }
  const bridgedTokenDeployer = await ethers.getContractAt(
    "BridgedTokenDeployer",
    bridgedTokenDeployerAddress,
  );
  const ambForeign = await ethers.getContractAt(
    "IAMB",
    bridgeSettings.arbitraryMessageBridgeETH,
  );

  const bridgedTokenDeployerTriggering = {
    to: bridgeSettings.arbitraryMessageBridgeETH,
    value: 0,
    data: ambForeign.interface.encodeFunctionData("requireToPassMessage", [
      bridgedTokenDeployer.address,
      bridgedTokenDeployer.interface.encodeFunctionData("deploy", []),
      3000000, // Max value is currently 2M, but it will be increased to 4M. 3M should be sufficient for vCowToken deployment.
    ]),
    operation: 0,
  };
  return bridgedTokenDeployerTriggering;
}

async function setupDeterministicSafe(
  settings: SafeCreationSettings,
  deploymentAddresses: DeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<{ address: string; transaction: MetaTransaction }> {
  const { to, data, address } = await prepareDeterministicSafeWithOwners(
    settings.owners,
    settings.threshold,
    deploymentAddresses,
    BigNumber.from(settings.nonce ?? 0),
    ethers,
  );
  const deploymentTransaction = {
    to,
    data,
    operation: SafeOperation.Call,
    value: "0",
  };
  const forwarder = await ethers.getContractAt(
    ContractName.Forwarder,
    deploymentAddresses.forwarder,
  );
  return {
    address,
    transaction: callIfContractExists({
      addressToTest: address,
      transaction: deploymentTransaction,
      forwarder,
    }),
  };
}

async function setupRealToken(
  settings: RealTokenCreationSettings,
  deploymentAddresses: DeploymentAddresses,
  params: RealTokenDeployParams,
  ethers: HardhatEthersHelpers,
): Promise<{ address: string; transaction: MetaTransaction }> {
  const salt = settings.salt ?? utils.hexZeroPad("0x", 32);
  if (utils.arrayify(salt).length !== 32) {
    throw new Error(`Invalid COW token deployment salt ${salt}`);
  }
  const { address, safeTransaction: transaction } =
    await getDeterministicDeploymentTransaction(
      ContractName.RealToken,
      params,
      ethers,
      salt,
    );

  const forwarder = await ethers.getContractAt(
    ContractName.Forwarder,
    deploymentAddresses.forwarder,
  );
  return {
    address,
    transaction: callIfContractExists({
      addressToTest: address,
      transaction,
      forwarder,
    }),
  };
}

async function setupVirtualToken(
  params: VirtualTokenDeployParams,
  safeDeploymentAddresses: SafeDeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<{ transaction: MetaTransaction }> {
  const { safeTransaction: transaction } =
    await getNonDeterministicDeploymentTransaction(
      ContractName.VirtualToken,
      params,
      safeDeploymentAddresses.createCall,
      ethers,
    );
  return {
    transaction,
  };
}

export function deploymentStepsIntoArray(
  steps: DeploymentSteps,
): JsonMetaTransaction[][] {
  const {
    cowDaoCreationTransaction,
    teamControllerCreationTransaction,
    investorFundsTargetCreationTransaction,
    cowTokenCreationTransaction,
    virtualCowTokenCreationTransaction,
    approvalOmniBridgeTx,
    relayTestFundsToOmniBridgeTx,
    transferCowTokenToCowDao,
    relayCowDaoDeployment,
  } = steps;
  return [
    [
      cowDaoCreationTransaction,
      teamControllerCreationTransaction,
      investorFundsTargetCreationTransaction,
    ],
    [
      cowTokenCreationTransaction,
      approvalOmniBridgeTx,
      relayTestFundsToOmniBridgeTx,
      transferCowTokenToCowDao,
    ],
    [virtualCowTokenCreationTransaction],
    [relayCowDaoDeployment],
  ];
}

export function groupWithMultisendCallOnly(
  proposalSteps: MetaTransaction[][],
  multisendCallOnlyAddress: string,
): MetaTransaction[] {
  return proposalSteps.map((transactions) => {
    if (
      transactions.some((tx) => tx.operation === SafeOperation.DelegateCall)
    ) {
      throw new Error(
        "Cannot join with MultisendCallOnly because one of the joined transactions is a delegatecall",
      );
    }
    return multisend(transactions, multisendCallOnlyAddress);
  });
}
