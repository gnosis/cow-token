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
import {
  prepareDeterministicSafeWithOwners,
  SafeDeploymentAddresses,
  SafeOperation,
} from "./lib/safe";
import { metadata } from "./token";

export interface SafeCreationSettings {
  threshold: number;
  owners: string[];
  nonce?: string;
}
export interface RealTokenCreationSettings {
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
export interface Proposal {
  steps: JsonMetaTransaction[];
  addresses: FinalAddresses;
}

export async function generateProposal(
  settings: DeploymentProposalSettings,
  safeDeploymentAddresses: SafeDeploymentAddresses,
  ethers: HardhatEthersHelpers,
): Promise<Proposal> {
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

  const realTokenDeployParams: RealTokenDeployParams = {
    cowDao,
    initialTokenHolder: cowDao,
    totalSupply: BigNumber.from(10).pow(3 * 3 + metadata.real.decimals),
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
