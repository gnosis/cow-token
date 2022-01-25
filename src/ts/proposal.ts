import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { BigNumber, utils } from "ethers";

import {
  getDeterministicDeploymentTransaction,
  getNonDeterministicDeploymentTransaction,
  RealTokenDeployParams,
  VirtualTokenDeployParams,
  ContractName,
} from "./deploy";
import { BridgeParameter } from "./lib/common-interfaces";
import {
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
  cowDao: SafeCreationSettings;
  teamController: SafeCreationSettings;
  cowToken: RealTokenCreationSettings;
  virtualCowToken: VirtualTokenCreationSettings;
  bridge: BridgeParameter;
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
export interface Proposal {
  steps: JsonMetaTransaction[];
  addresses: FinalAddresses;
}

export async function generateProposal(
  settings: DeploymentProposalSettings,
  deploymentAddresses: DeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<Proposal> {
  const { address: cowDao, transaction: cowDaoCreationTransaction } =
    await setupDeterministicSafe(settings.cowDao, deploymentAddresses, ethers);

  const {
    address: teamController,
    transaction: teamControllerCreationTransaction,
  } = await setupDeterministicSafe(
    settings.teamController,
    deploymentAddresses,
    ethers,
  );

  const {
    address: investorFundsTarget,
    transaction: investorFundsTargetCreationTransaction,
  } = await setupDeterministicSafe(
    { owners: [cowDao], threshold: 1 },
    deploymentAddresses,
    ethers,
  );

  const realTokenDeployParams: RealTokenDeployParams = {
    cowDao,
    initialTokenHolder: cowDao,
    totalSupply: BigNumber.from(10).pow(3 * 3 + metadata.real.decimals),
  };
  const { address: cowToken, transaction: cowTokenCreationTransaction } =
    await setupRealToken(
      settings.cowToken,
      deploymentAddresses,
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
      deploymentAddresses,
      ethers,
    );

  return {
    steps: [
      cowDaoCreationTransaction,
      teamControllerCreationTransaction,
      investorFundsTargetCreationTransaction,
      cowTokenCreationTransaction,
      virtualCowTokenCreationTransaction,
    ].map((step) => ({ ...step, value: step.value.toString() })),
    addresses: {
      cowDao,
      teamController,
      investorFundsTarget,
      cowToken,
    },
  };
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
