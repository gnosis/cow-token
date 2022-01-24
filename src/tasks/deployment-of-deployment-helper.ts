import { promises as fs } from "fs";

import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20Metadata.json";
import { BigNumber, Contract, utils } from "ethers";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  metadata,
  computeProofs,
  parseCsvFile,
  constructorInput,
  ContractName,
  DeploymentHelperDeployParams,
} from "../ts";
import { removeSplitClaimFiles, splitClaimsAndSaveToFolder } from "../ts/split";

import {
  defaultDeploymentArgs,
  defaultTokens,
  omniBridgeDefaults,
  OUTPUT_FOLDER_GC,
} from "./ts/constants";
import { SupportedChainId, deployWithOwners } from "./ts/safe";

async function parseArgs(
  args: DeployTaskArgs,
  { ethers }: HardhatRuntimeEnvironment,
): Promise<CleanArgs> {
  const foreignChainId = args.foreignChainId;
  if (foreignChainId !== "1" && foreignChainId !== "56") {
    throw new Error(
      "There exists no chain omni bridge between ForeignChainId and the gnosis chain",
    );
  }
  const multiTokenMediatorHomeAddress =
    omniBridgeDefaults[foreignChainId].multiTokenMediatorHome;

  const chainId = (await ethers.provider.getNetwork()).chainId.toString();

  if (chainId !== "100" && chainId !== "4") {
    throw new Error(`Deployment only intended for Gnosis Chain`);
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
    multiTokenMediatorHomeAddress,
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
  };
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
  foreignChainId: string;
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
  multiTokenMediatorHomeAddress: string;
}

interface Token {
  decimals: number;
  instance: Contract;
}

const setupDeploymentHelperTask: () => void = () => {
  task(
    "deployment-helper-deployment",
    "Generate a list of pseudorandom claims for each signer and deploy test contracts on the current network.",
  )
    .addParam(
      "foreignChainId",
      "The chainId from the chain the tokens are bridged over to gnosis chain, e.g. mainnet = '1' and bsc = '56' ",
      "1",
      types.string,
    )
    .addPositionalParam(
      "claimCsv",
      "Path to the CSV file that contains the list of claims to generate.",
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
    .setAction(async (args, hre) => {
      const { ethers } = hre;
      const [deployer] = await ethers.getSigners();
      const parsedValues = await parseArgs(args, hre);
      console.log(`Using deployer ${deployer.address}`);

      console.log("Reading user claims for gnosis chain from file...");
      const claims = await parseCsvFile(parsedValues.claimCsv);

      console.log("Generating Merkle proofs...");
      const { merkleRoot, claims: claimsWithProof } = computeProofs(claims);

      const deploySafe: () => Promise<Contract> = async () =>
        (await deployWithOwners([deployer.address], 1, deployer, hre)).connect(
          ethers.provider,
        );
      const communityFundsTarget =
        parsedValues.communityFundsTargetAddress ??
        (await deploySafe()).address;
      const investorFundsTarget =
        parsedValues.investorFundsTargetAddress ?? (await deploySafe()).address;
      const teamController =
        parsedValues.teamControllerAddress ?? (await deploySafe()).address;

      const deploymentHelperParameters: DeploymentHelperDeployParams = {
        multiTokenMediatorHome: parsedValues.multiTokenMediatorHomeAddress,
        merkleRoot,
        communityFundsTarget,
        investorFundsTarget,
        usdcToken: parsedValues.usdc.instance.address,
        usdcPrice: parsedValues.usdcPerCow,
        gnoToken: parsedValues.gno.instance.address,
        gnoPrice: utils
          .parseUnits("1", parsedValues.gno.decimals)
          .mul(parsedValues.usdcPerCow)
          .div(parsedValues.usdcPerGno),
        nativeTokenPrice: utils
          .parseUnits("1", parsedValues.weth.decimals)
          .mul(parsedValues.usdcPerCow)
          .div(parsedValues.usdcPerWeth),
        wrappedNativeToken: parsedValues.weth.instance.address,
        teamController,
      };

      const DeploymentHelper = await hre.ethers.getContractFactory(
        "DeploymentHelper",
      );
      const deploymentHelper = await DeploymentHelper.deploy(
        ...constructorInput(
          ContractName.DeploymentHelper,
          deploymentHelperParameters,
        ),
      );

      console.log("Clearing old files...");
      await fs.rm(`${OUTPUT_FOLDER_GC}/claims.json`, {
        recursive: true,
        force: true,
      });
      await fs.rm(`${OUTPUT_FOLDER_GC}/params.json`, {
        recursive: true,
        force: true,
      });
      await removeSplitClaimFiles(OUTPUT_FOLDER_GC);

      console.log("Saving generated data to file...");
      await fs.mkdir(OUTPUT_FOLDER_GC, { recursive: true });
      await fs.writeFile(
        `${OUTPUT_FOLDER_GC}/claims.json`,
        JSON.stringify(claimsWithProof),
      );
      await fs.writeFile(
        `${OUTPUT_FOLDER_GC}/params.json`,
        JSON.stringify({
          deploymentHelper: deploymentHelper.address,
          ...deploymentHelperParameters,
        }),
      );
      await splitClaimsAndSaveToFolder(claimsWithProof, OUTPUT_FOLDER_GC);
    });
};

export { setupDeploymentHelperTask };
