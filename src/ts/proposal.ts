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
  prepareDeterministicSafeWithOwners,
  SafeDeploymentAddresses,
  SafeOperation,
} from "./lib/safe";
import { metadata } from "./token";

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
}

export type JsonMetaTransaction = Record<
  keyof Omit<MetaTransaction, "operation">,
  string
> & { operation: number };
export interface FinalAddresses {
  cowDao: string;
  teamController: string;
  investorFundsTarget: string;
  cowToken: string;
}
export interface DeploymentSteps {
  cowDaoCreationTransaction: JsonMetaTransaction;
  teamControllerCreationTransaction: JsonMetaTransaction;
  investorFundsTargetCreationTransaction: JsonMetaTransaction;
  cowTokenCreationTransaction: JsonMetaTransaction;
  virtualCowTokenCreationTransaction: JsonMetaTransaction;
  approvalOmniBridgeTx: JsonMetaTransaction;
  relayTestFundsToOmniBridgeTx: JsonMetaTransaction;
  transferCowTokenToCowDao: JsonMetaTransaction;
}
export interface ProposalAsStruct {
  steps: DeploymentSteps;
  addresses: FinalAddresses;
}

export interface Proposal {
  steps: JsonMetaTransaction[];
  addresses: FinalAddresses;
}

export async function generateProposal(
  settings: DeploymentProposalSettings,
  safeDeploymentAddresses: SafeDeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<Proposal> {
  const proposal = await generateProposalAsStruct(
    settings,
    safeDeploymentAddresses,
    ethers,
  );
  return {
    steps: deploymentStepsIntoArray(proposal.steps),
    addresses: proposal.addresses,
  };
}

export async function generateProposalAsStruct(
  settings: DeploymentProposalSettings,
  safeDeploymentAddresses: SafeDeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<ProposalAsStruct> {
  const { address: cowDao, transaction: cowDaoCreationTransaction } =
    await setupDeterministicSafe(
      settings.cowDao,
      safeDeploymentAddresses,
      ethers,
    );

  const {
    address: teamController,
    transaction: teamControllerCreationTransaction,
  } = await setupDeterministicSafe(
    settings.teamController,
    safeDeploymentAddresses,
    ethers,
  );

  const {
    address: investorFundsTarget,
    transaction: investorFundsTargetCreationTransaction,
  } = await setupDeterministicSafe(
    { owners: [cowDao], threshold: 1 },
    safeDeploymentAddresses,
    ethers,
  );

  const totalSupply = BigNumber.from(10).pow(3 * 3 + metadata.real.decimals);
  const realTokenDeployParams: RealTokenDeployParams = {
    cowDao,
    initialTokenHolder: settings.gnosisDao,
    totalSupply,
  };
  const { address: cowToken, transaction: cowTokenCreationTransaction } =
    await setupRealToken(settings.cowToken, realTokenDeployParams, ethers);

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
      safeDeploymentAddresses,
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
async function setupDeterministicSafe(
  settings: SafeCreationSettings,
  safeDeploymentAddresses: SafeDeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<{ address: string; transaction: MetaTransaction }> {
  const { to, data, address } = await prepareDeterministicSafeWithOwners(
    settings.owners,
    settings.threshold,
    safeDeploymentAddresses,
    BigNumber.from(settings.nonce ?? 0),
    ethers,
  );
  return {
    address,
    transaction: { to, data, operation: SafeOperation.Call, value: "0" },
  };
}

async function setupRealToken(
  settings: RealTokenCreationSettings,
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
  return {
    address,
    transaction,
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
): JsonMetaTransaction[] {
  const {
    cowDaoCreationTransaction,
    teamControllerCreationTransaction,
    investorFundsTargetCreationTransaction,
    cowTokenCreationTransaction,
    virtualCowTokenCreationTransaction,
    approvalOmniBridgeTx,
    relayTestFundsToOmniBridgeTx,
    transferCowTokenToCowDao,
  } = steps;
  return [
    cowDaoCreationTransaction,
    teamControllerCreationTransaction,
    investorFundsTargetCreationTransaction,
    cowTokenCreationTransaction,
    virtualCowTokenCreationTransaction,
    approvalOmniBridgeTx,
    relayTestFundsToOmniBridgeTx,
    transferCowTokenToCowDao,
  ];
}
