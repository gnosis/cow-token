import { promises as fs } from "fs";

import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20Metadata.json";
import { expect } from "chai";
import { BigNumber, Contract, utils } from "ethers";
import { id } from "ethers/lib/utils";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  metadata,
  prepareRealAndVirtualDeploymentFromSafe,
  prepareVirtualDeploymentFromSafe,
  RealTokenDeployParams,
  VirtualTokenDeployParams,
  computeProofs,
  parseCsvFile,
} from "../ts";
import { contractsCreatedWithCreateCall } from "../ts/lib/safe";
import { removeSplitClaimFiles, splitClaimsAndSaveToFolder } from "../ts/split";

import {
  defaultTokens,
  defaultDeploymentArgs,
  omniBridgeDefaults,
  OUTPUT_FOLDER,
} from "./ts/constants";
import {
  SupportedChainId,
  isChainIdSupported,
  deployWithOwners,
  CreateCallDeployment,
  MultiSendDeployment,
  execSafeTransaction,
  gnosisSafeAt,
} from "./ts/safe";

export async function getCowTokenContract(
  address: string,
  hre: HardhatRuntimeEnvironment,
): Promise<Contract> {
  const CowToken = await hre.ethers.getContractFactory("CowProtocolContract");
  const contract = await CowToken.attach(address);
  return contract;
}

interface DeployTaskArgs {
  claimCsv: string;
  totalSupply?: string;
  usdcToken?: string;
  usdcPerCow?: string;
  gnoToken?: string;
  usdcPerGno?: string;
  wethToken?: string;
  usdcPerWeth?: string;
  gnosisDao?: string;
  cowDao?: string;
  communityFundsTarget?: string;
  investorFundsTarget?: string;
  teamController?: string;
  deploymentHelperGnosisChain?: string;
  cowToken?: string;
}
interface CleanArgs {
  claimCsv: string;
  totalSupply: BigNumber;
  usdc: Token;
  usdcPerCow: BigNumber;
  gno: Token;
  usdcPerGno: BigNumber;
  weth: Token;
  usdcPerWeth: BigNumber;
  chainId: SupportedChainId;
  gnosisDaoAddress: string | undefined;
  cowDaoAddress: string | undefined;
  communityFundsTargetAddress: string | undefined;
  investorFundsTargetAddress: string | undefined;
  teamControllerAddress: string | undefined;
  deploymentHelperGnosisChainAddress: string | undefined;
  cowTokenAddress: string | undefined;
}

interface Token {
  decimals: number;
  instance: Contract;
}

interface MaybeDeterministicDeployment {
  address: string;
  transaction: MetaTransaction | null;
}
interface Deployment {
  transaction: MetaTransaction;
}

async function parseArgs(
  args: DeployTaskArgs,
  { ethers }: HardhatRuntimeEnvironment,
): Promise<CleanArgs> {
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();

  if (!isChainIdSupported(chainId)) {
    throw new Error(`Chain id ${chainId} not supported by the Gnosis Safe`);
  }

  function defaultIfUnset<Key extends keyof typeof defaultTokens>(
    address: string | undefined,
    token: Key,
  ): string {
    const defaultByChainId: Record<string, string> = defaultTokens[token];
    if (
      address === undefined &&
      !Object.keys(defaultByChainId).includes(chainId)
    ) {
      throw new Error(
        `Chain id ${chainId} does not have a default address for ${token}`,
      );
    }
    const defaultAddress =
      defaultByChainId[chainId as keyof typeof defaultByChainId];
    return address ?? defaultAddress;
  }
  async function getToken(address: string): Promise<Token> {
    const instance = new Contract(address, IERC20.abi).connect(ethers.provider);
    const decimals = await instance.decimals();
    if (typeof decimals !== "number") {
      throw new Error(
        `Invalid number of decimals for token at address ${address}`,
      );
    }
    return {
      instance,
      decimals,
    };
  }
  const [usdc, gno, weth] = await Promise.all([
    getToken(defaultIfUnset(args.usdcToken, "usdc")),
    getToken(defaultIfUnset(args.gnoToken, "gno")),
    getToken(defaultIfUnset(args.wethToken, "weth")),
  ]);
  function checksummedAddress(address: string | undefined): string | undefined {
    return address === undefined ? undefined : utils.getAddress(address);
  }
  return {
    chainId,
    claimCsv: args.claimCsv,
    totalSupply: utils.parseUnits(
      args.totalSupply ?? defaultDeploymentArgs.totalSupply,
      metadata.real.decimals,
    ),
    usdc,
    usdcPerCow: utils.parseUnits(
      args.usdcPerCow ?? defaultDeploymentArgs.usdcPerCow,
      usdc.decimals,
    ),
    gno,
    usdcPerGno: utils.parseUnits(
      args.usdcPerGno ?? defaultDeploymentArgs.usdcPerGno,
      usdc.decimals,
    ),
    weth,
    usdcPerWeth: utils.parseUnits(
      args.usdcPerWeth ?? defaultDeploymentArgs.usdcPerWeth,
      usdc.decimals,
    ),
    gnosisDaoAddress: checksummedAddress(args.gnosisDao),
    cowDaoAddress: checksummedAddress(args.cowDao),
    communityFundsTargetAddress: checksummedAddress(args.communityFundsTarget),
    investorFundsTargetAddress: checksummedAddress(args.investorFundsTarget),
    teamControllerAddress: checksummedAddress(args.teamController),
    deploymentHelperGnosisChainAddress: checksummedAddress(
      args.deploymentHelperGnosisChain,
    ),
    cowTokenAddress: checksummedAddress(args.cowToken),
  };
}

const setupTestDeploymentTask: () => void = () => {
  task(
    "test-deployment",
    "Generate a list of pseudorandom claims for each signer and deploy test contracts on the current network.",
  )
    .addPositionalParam(
      "claimCsv",
      "Path to the CSV file that contains the list of claims to generate.",
    )
    .addOptionalParam(
      "totalSupply",
      "The total supply of real token minted on deployment.",
      defaultDeploymentArgs.totalSupply,
      types.string,
    )
    .addOptionalParam("usdcToken", "Address of token USDC.")
    .addOptionalParam("gnoToken", "Address of token GNO.")
    .addOptionalParam("wethToken", "Address of token WETH.")
    .addOptionalParam(
      "usdcPerCow",
      "How many USDC a COW is worth.",
      defaultDeploymentArgs.usdcPerCow,
      types.string,
    )
    .addOptionalParam(
      "usdcPerGno",
      "How many USDC a GNO is worth.",
      defaultDeploymentArgs.usdcPerGno,
      types.string,
    )
    .addOptionalParam(
      "usdcPerWeth",
      "How many USDC a WETH is worth.",
      defaultDeploymentArgs.usdcPerWeth,
      types.string,
    )
    .addOptionalParam(
      "gnosisDao",
      "The address of the Gnosis Safe from which the contract will be deployed. If left out, a dedicated Gnosis Safe owned by the deployer will be deployed for this purpose.",
    )
    .addOptionalParam(
      "cowDao",
      "The address representing the Cow DAO. If left out, a dedicated Gnosis Safe owned by the deployer will be deployed for this purpose.",
    )
    .addOptionalParam(
      "communityFundsTarget",
      "The address that will receive the community funds. If left out, a dedicated Gnosis Safe owned by the deployer will be deployed for this purpose.",
    )
    .addOptionalParam(
      "investorFundsTarget",
      "The address that will receive the investor funds. If left out, a dedicated Gnosis Safe owned by the deployer will be deployed for this purpose.",
    )
    .addOptionalParam(
      "teamController",
      "The address that controls team claims. If left out, a dedicated Gnosis Safe owned by the deployer will be deployed for this purpose.",
    )
    .addOptionalParam(
      "deploymentHelperGnosisChain",
      "The address of the contract that contains the code for the gnosis chain deployment",
    )
    .addOptionalParam(
      "cowToken",
      "The virtual token will point to this address for the cow token. If left out, the real token will be deployed by this script.",
    )
    .setAction(async (args, hre) => {
      await generateClaimsAndDeploy(await parseArgs(args, hre), hre);
    });
};

async function generateClaimsAndDeploy(
  {
    claimCsv,
    totalSupply,
    usdc,
    usdcPerCow,
    gno,
    usdcPerGno,
    weth,
    usdcPerWeth,
    chainId,
    gnosisDaoAddress,
    cowDaoAddress,
    communityFundsTargetAddress,
    investorFundsTargetAddress,
    teamControllerAddress,
    deploymentHelperGnosisChainAddress,
    cowTokenAddress,
  }: CleanArgs,
  hre: HardhatRuntimeEnvironment,
) {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const salt = id(Date.now().toString());
  console.log(`Using deployer ${deployer.address}`);

  console.log("Reading user claims from file...");
  const claims = await parseCsvFile(claimCsv);

  console.log("Generating Merkle proofs...");
  const { merkleRoot, claims: claimsWithProof } = computeProofs(claims);

  // The contracts are deployed from a contract and require that some receiver
  // addresses are set. All these are created now and are Gnosis Safe.
  console.log("Setting up administration addresses...");
  const deploySafe: () => Promise<Contract> = async () =>
    (await deployWithOwners([deployer.address], 1, deployer, hre)).connect(
      ethers.provider,
    );
  const gnosisDao =
    gnosisDaoAddress === undefined
      ? await deploySafe()
      : gnosisSafeAt(gnosisDaoAddress).connect(deployer);
  // The remaining addresses don't need to be Gnosis Safes. We deploy Gnosis
  // Safes by default to make the deployment more similar to the expected final
  // deployment.
  const cowDao =
    cowDaoAddress ??
    (await deployWithOwners([gnosisDao.address], 1, deployer, hre)).connect(
      ethers.provider,
    ).address;
  const communityFundsTarget =
    communityFundsTargetAddress ?? (await deploySafe()).address;
  const investorFundsTarget =
    investorFundsTargetAddress ?? (await deploySafe()).address;
  const teamController = teamControllerAddress ?? (await deploySafe()).address;

  const realTokenDeployParams: RealTokenDeployParams = {
    initialTokenHolder: gnosisDao.address,
    totalSupply,
    cowDao,
  };

  const virtualTokenDeployParams: Omit<VirtualTokenDeployParams, "realToken"> =
    {
      merkleRoot,
      communityFundsTarget: communityFundsTarget,
      investorFundsTarget: investorFundsTarget,
      usdcToken: usdc.instance.address,
      usdcPrice: usdcPerCow,
      gnoToken: gno.instance.address,
      gnoPrice: utils
        .parseUnits("1", gno.decimals)
        .mul(usdcPerCow)
        .div(usdcPerGno),
      wrappedNativeToken: weth.instance.address,
      nativeTokenPrice: utils
        .parseUnits("1", weth.decimals)
        .mul(usdcPerCow)
        .div(usdcPerWeth),
      teamController: teamController,
    };

  console.log("Generating deploy transactions...");
  let realTokenDeployment: MaybeDeterministicDeployment;
  let virtualTokenDeployment: Deployment;
  if (cowTokenAddress === undefined) {
    const deployment = await prepareRealAndVirtualDeploymentFromSafe(
      realTokenDeployParams,
      virtualTokenDeployParams,
      MultiSendDeployment.networkAddresses[chainId],
      CreateCallDeployment.networkAddresses[chainId],
      ethers,
      salt,
    );
    realTokenDeployment = {
      address: deployment.realTokenAddress,
      transaction: deployment.realTokenDeployTransaction,
    };
    virtualTokenDeployment = {
      transaction: deployment.virtualTokenDeployTransaction,
    };
    expect(await ethers.provider.getCode(realTokenDeployment.address)).to.equal(
      "0x",
    );
  } else {
    {
      const deployment = await prepareVirtualDeploymentFromSafe(
        { ...virtualTokenDeployParams, realToken: cowTokenAddress },
        ethers,
        CreateCallDeployment.networkAddresses[chainId],
      );
      realTokenDeployment = { address: cowTokenAddress, transaction: null };
      virtualTokenDeployment = {
        transaction: deployment.virtualTokenDeployTransaction,
      };
    }
  }

  console.log("Clearing old files...");
  await fs.rm(`${OUTPUT_FOLDER}/claims.json`, { recursive: true, force: true });
  await fs.rm(`${OUTPUT_FOLDER}/params.json`, { recursive: true, force: true });
  await removeSplitClaimFiles(OUTPUT_FOLDER);

  console.log("Saving generated data to file...");
  await fs.mkdir(OUTPUT_FOLDER, { recursive: true });
  await fs.writeFile(
    `${OUTPUT_FOLDER}/claims.json`,
    JSON.stringify(claimsWithProof),
  );
  await fs.writeFile(
    `${OUTPUT_FOLDER}/params.json`,
    deployParamsToString({
      realTokenDeployParams,
      virtualTokenDeployParams,
      realTokenAddress: realTokenDeployment.address,
    }),
  );
  await splitClaimsAndSaveToFolder(claimsWithProof, OUTPUT_FOLDER);

  if (realTokenDeployment.transaction !== null) {
    console.log("Deploying real token...");
    const deploymentReal = await execSafeTransaction(
      gnosisDao.connect(deployer),
      realTokenDeployment.transaction,
      [deployer],
    );
    await expect(deploymentReal).to.emit(
      gnosisDao.connect(ethers.provider),
      "ExecutionSuccess",
    );
    expect(
      await ethers.provider.getCode(realTokenDeployment.address),
    ).not.to.equal("0x");
  }

  console.log("Deploying virtual token...");
  const deploymentVirtual = await execSafeTransaction(
    gnosisDao.connect(deployer),
    virtualTokenDeployment.transaction,
    [deployer],
  );
  await expect(deploymentVirtual).to.emit(gnosisDao, "ExecutionSuccess");
  const createdContracts = await contractsCreatedWithCreateCall(
    deploymentVirtual,
    CreateCallDeployment.networkAddresses[chainId],
  );
  expect(createdContracts).to.have.length(1);
  const virtualTokenAddress = createdContracts[0];
  expect(await ethers.provider.getCode(virtualTokenAddress)).not.to.equal("0x");

  console.log("Updating files with deployment information...");
  await fs.writeFile(
    `${OUTPUT_FOLDER}/params.json`,
    deployParamsToString({
      realTokenDeployParams,
      virtualTokenDeployParams,
      realTokenAddress: realTokenDeployment.address,
      virtualTokenAddress,
    }),
  );

  expect(await ethers.provider.getCode(virtualTokenAddress)).not.to.equal("0x");
  if (deploymentHelperGnosisChainAddress !== undefined) {
    if (chainId !== "1" && chainId !== "56") {
      throw new Error(
        `ArbitraryMessageBridge to gnosis chain not available for your selected network with id ${chainId}`,
      );
    }
    const cowToken = await ethers.getContractAt(
      "CowProtocolToken",
      realTokenDeployment.address,
    );
    const amountToRelay = ethers.utils.parseEther("1");
    const multiTokenMediator = await hre.ethers.getContractAt(
      "OmniBridgeInterface",
      omniBridgeDefaults[chainId].multiTokenMediatorForeign,
    );

    console.log("Approving bridging contract");
    const approvalTx = {
      to: cowToken.address,
      value: 0,
      data: cowToken.interface.encodeFunctionData("approve", [
        multiTokenMediator.address,
        amountToRelay,
      ]),
      operation: 0,
    };
    await execSafeTransaction(gnosisDao.connect(deployer), approvalTx, [
      deployer,
    ]);

    console.log("Send tokens to gnosis-chain");
    const relayTx = {
      to: multiTokenMediator.address,
      value: 0,
      data: multiTokenMediator.interface.encodeFunctionData("relayTokens", [
        cowToken.address,
        utils.getAddress("0x" + "00".repeat(19) + "01"),
        amountToRelay,
      ]),
      operation: 0,
    };
    await execSafeTransaction(gnosisDao.connect(deployer), relayTx, [deployer]);

    console.log("Trigger gnosis chain deployment");
    const ambForeign = await hre.ethers.getContractAt(
      "AMBInterface",
      omniBridgeDefaults[chainId].ambForeign,
    );

    const deploymentHelperGnosisChain = await hre.ethers.getContractAt(
      "DeploymentHelper",
      deploymentHelperGnosisChainAddress,
    );

    const deploymentViaBridgeTx = {
      to: ambForeign.address,
      value: 0,
      data: ambForeign.interface.encodeFunctionData("requireToPassMessage", [
        deploymentHelperGnosisChainAddress,
        deploymentHelperGnosisChain.interface.encodeFunctionData("deploy", [
          cowToken.address,
        ]),
        3000000, // Max value is 5M, 3M should be sufficient for vCowToken deployment.
      ]),
      operation: 0,
    };
    await execSafeTransaction(
      gnosisDao.connect(deployer),
      deploymentViaBridgeTx,
      [deployer],
    );

    console.log("Transfer most cowToken into cowDao");
    const transferToken = {
      to: cowToken.address,
      value: 0,
      data: cowToken.interface.encodeFunctionData("transfer", [
        cowDao,
        totalSupply.sub(amountToRelay),
      ]),
      operation: 0,
    };
    await execSafeTransaction(gnosisDao.connect(deployer), transferToken, [
      deployer,
    ]);
  } else {
    console.log("Skipping the relay to Gnosis chain");
  }
}

interface DeploymentInfo {
  realTokenDeployParams: RealTokenDeployParams;
  virtualTokenDeployParams: Omit<VirtualTokenDeployParams, "realToken">;
  realTokenAddress: string;
  virtualTokenAddress?: string;
}
function deployParamsToString({
  realTokenDeployParams,
  virtualTokenDeployParams,
  realTokenAddress,
  virtualTokenAddress,
}: DeploymentInfo): string {
  return JSON.stringify(
    {
      realTokenAddress,
      virtualTokenAddress,
      ...realTokenDeployParams,
      ...virtualTokenDeployParams,
    },
    undefined,
    2,
  );
}

export { setupTestDeploymentTask };
