import { promises as fs } from "fs";

import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
    computeProofs,
    parseCsvFile,
    DeploymentHelperDeployParams,
    DeploymentProposalSettings,
    generateProposal,
    constructorInput,
    ContractName,
} from "../ts";
import { removeSplitClaimFiles, splitClaimsAndSaveToFolder } from "../ts/split";

import {
    defaultTokens,
    OUTPUT_FOLDER_GC,
} from "./ts/constants";
import { defaultSafeDeploymentAddresses } from "./ts/safe";

export interface Settings
    extends Omit<DeploymentProposalSettings, "virtualCowToken"> {
    virtualCowToken: VirtualTokenSettings;
    multiTokenMediatorGnosisChain: string;
}

interface VirtualTokenSettings {
    gnoPrice: string;
    nativeTokenPrice: string;
}

interface Args {
    claims: string;
    settings: string;
}

const setupDeploymentHelperTask: () => void = () => {
    task(
        "deployment-helper-deployment",
        "Generate a list of pseudorandom claims for each signer and deploy test contracts on the current network.",
    )
        .addPositionalParam(
            "claim",
            "Path to the CSV file that contains the list of claims to generate.",
        )
        .addParam(
            "settings",
            "Path to the JSON file that contains the deployment settings.",
        )
        .setAction(generateDeployment);
};

async function generateDeployment(
    { claims: claimCsv, settings: settingsJson }: Args,
    hre: HardhatRuntimeEnvironment,
): Promise<void> {
    const { ethers } = hre;
    const [deployer] = await ethers.getSigners();

    const chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();
    if (chainId !== "100") {
        throw new Error(
            `This script must be run on gnosis chain. Found chainid ${chainId}`,
        );
    }

    const inputSettings: Settings = JSON.parse(
        await fs.readFile(settingsJson, "utf8"),
    );
    console.log(`Using deployer ${deployer.address}`);

    console.log("Reading user claims for gnosis chain from file...");
    const claims = await parseCsvFile(claimCsv);

    console.log("Generating Merkle proofs...");
    const { merkleRoot, claims: claimsWithProof } = computeProofs(claims);

    const settings = {
        ...inputSettings,
        virtualCowToken: {
            ...inputSettings.virtualCowToken,
            merkleRoot,
            usdcToken: defaultTokens.usdc[chainId],
            gnoToken: defaultTokens.gno[chainId],
            wrappedNativeToken: defaultTokens.weth[chainId],
        },
    };

    const { addresses } = await generateProposal(
        settings,
        defaultSafeDeploymentAddresses(chainId),
        hre.ethers,
    );

    const deploymentHelperParameters: DeploymentHelperDeployParams = {
        foreignToken: addresses.cowToken,
        multiTokenMediatorHome: settings.multiTokenMediatorGnosisChain,
        merkleRoot,
        communityFundsTarget: addresses.cowDao,
        gnoToken: settings.virtualCowToken.gnoToken,
        gnoPrice: settings.virtualCowToken.gnoPrice,
        nativeTokenPrice: settings.virtualCowToken.nativeTokenPrice,
        wrappedNativeToken: settings.virtualCowToken.wrappedNativeToken,
    };

    const DeploymentHelper = await hre.ethers.getContractFactory(
        "DeploymentHelper",
    );
    const deploymentHelper = "0x1321654"
    // await DeploymentHelper.deploy(
    //     ...constructorInput(
    //         ContractName.DeploymentHelper,
    //         deploymentHelperParameters,
    //     ),
    // );

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
        `${OUTPUT_FOLDER_GC}/addresses.json`,
        JSON.stringify([deploymentHelper], undefined, 2),
    );
    await fs.writeFile(
        `${OUTPUT_FOLDER_GC}/claims.json`,
        JSON.stringify(claimsWithProof),
    );
    await splitClaimsAndSaveToFolder(claimsWithProof, OUTPUT_FOLDER_GC);
};

export { setupDeploymentHelperTask };
