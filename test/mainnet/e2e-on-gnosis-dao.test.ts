
import { defaultAbiCoder } from "ethers/lib/utils";
import hre from "hardhat";
import { defaultSafeDeploymentAddresses, execSafeTransaction, gnosisSafeAt } from "../../src/tasks/ts/safe";

import { forkMainnet, stopMainnetFork } from "./chain-fork";
import { promises as fs } from "fs";

import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
    DEFAULT_FORWARDER,
    parseCsvFile,
    computeProofs,
    removeSplitClaimFiles,
    splitClaimsAndSaveToFolder,
    generateProposal,
    Proposal,
    groupWithMultisendCallOnly,
} from "../../src/ts";
import { Args, Settings } from "../../src/ts/lib/common-interfaces";
import { defaultTokens } from "../../src/ts/lib/constants";
import { Contract } from "ethers";
import { assert } from "console";


// copied code, todo: refactor to use it only once
export async function generateDeployment(
    { claims: claimCsv, settings: settingsJson }: Args,
    hre: HardhatRuntimeEnvironment,
    outputFolder: string,
): Promise<[Proposal, Settings]> {
    const chainIdUntyped = (
        await hre.ethers.provider.getNetwork()
    ).chainId.toString();
    if (!["1", "4", "100", "31337"].includes(chainIdUntyped)) {
        throw new Error(`Chain id ${chainIdUntyped} not supported`);
    }
    const chainId = chainIdUntyped as "1" | "4" | "100" | "31337";

    console.log("Processing input files...");
    // TODO: validate settings
    const inputSettings: Settings = JSON.parse(
        await fs.readFile(settingsJson, "utf8"),
    );
    const claims = await parseCsvFile(claimCsv);

    console.log("Generating Merkle proofs...");
    const { merkleRoot, claims: claimsWithProof } = computeProofs(claims);

    const settings = {
        ...inputSettings,
        virtualCowToken: {
            gnoPrice: inputSettings.virtualCowToken.gnoPrice,
            nativeTokenPrice: inputSettings.virtualCowToken.nativeTokenPrice,
            merkleRoot,
            usdcToken: defaultTokens.usdc[chainId === "31337" ? "1" : chainId],
            gnoToken: defaultTokens.gno[chainId === "31337" ? "1" : chainId],
            wrappedNativeToken: defaultTokens.weth[chainId === "31337" ? "1" : chainId],
        },
    };
    const proposal = await generateProposal(
        settings,
        {
            ...defaultSafeDeploymentAddresses(chainId === "31337" ? "1" : chainId),
            forwarder: DEFAULT_FORWARDER,
        },
        {
            ...defaultSafeDeploymentAddresses("100"),
            forwarder: DEFAULT_FORWARDER,
        },
        hre.ethers,
    );
    const { steps, addresses } = proposal;

    console.log("Clearing old files...");
    await fs.rm(`${outputFolder}/addresses.json`, {
        recursive: true,
        force: true,
    });
    await fs.rm(`${outputFolder}/steps.json`, { recursive: true, force: true });
    await fs.rm(`${outputFolder}/claims.json`, { recursive: true, force: true });
    await removeSplitClaimFiles(outputFolder);

    console.log("Saving generated data to file...");
    await fs.mkdir(outputFolder, { recursive: true });
    await fs.writeFile(
        `${outputFolder}/addresses.json`,
        JSON.stringify(addresses, undefined, 2),
    );
    await fs.writeFile(
        `${outputFolder}/steps.json`,
        JSON.stringify(steps, undefined, 2),
    );
    await fs.writeFile(
        `${outputFolder}/claims.json`,
        JSON.stringify(claimsWithProof),
    );
    await splitClaimsAndSaveToFolder(claimsWithProof, outputFolder);

    return [proposal, settings];
}


describe("Mainnet: deployment from gnosis DAO", () => {
    before(async () => {
        await forkMainnet(hre);
    });

    after(async () => {
        await stopMainnetFork(hre);
    });

    it.only("checks for success of whole deployment", async function () {

        // Step 1: Generating proposals
        const [{ addresses, steps }, settings] = await generateDeployment(
            { claims: './example/mainnet-deployment/claims.csv', settings: './example/mainnet-deployment/settings.json' },
            hre,
            './output/mainnet-tests/claims',
        );
        let groupedSteps = groupWithMultisendCallOnly(
            steps,
            defaultSafeDeploymentAddresses("1").multisendCallOnly,
        )

        // Step 2: Making Proposal to reality module
        // arbitrarily chosen proposalID
        const proposalId = "548948140"
        const realityModule = await getRealityModule(hre);
        const formerProposerAccount = "0x7e4A8391C728fEd9069B2962699AB416628B19Fa";
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [formerProposerAccount],
        });
        const proposer = await hre.ethers.provider.getSigner(
            formerProposerAccount,
        );
        const gnoToken = await getGNOToken(hre);
        const realitio = await getRealityIO(hre);

        // Dummy modifications for debugging
        groupedSteps = groupedSteps.slice(0, 1)
        groupedSteps[0].data = '0x015640100505'

        const proposals = Array.from(Array(groupedSteps.length).keys()).map(x => { return { tx: groupedSteps[x], id: x } })
        let txsHashes = [];
        for (const proposal of proposals) {
            txsHashes.push(await realityModule.connect(proposer).getTransactionHash(proposal.tx.to, parseInt(proposal.tx.value.toString()), proposal.tx.data, proposal.tx.operation, proposal.id));
        }


        console.log("We will run the following proposal steps", proposals)
        console.log("The proposal results in the following transaction hashes:", txsHashes)
        const tx = await realityModule.connect(proposer).addProposal(proposalId, txsHashes);
        const receipt = await tx.wait()

        // Step 3: Vote for proposal and wait until deadline passes
        const event = receipt.events?.filter((x: any) => { return x.event == "ProposalQuestionCreated" })
        const question_id = event[0].args[0]
        const gnoWhaleAddress = "0x39d787fdf7384597c7208644dbb6fda1cca4ebdf";
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [gnoWhaleAddress],
        });
        const gnoWhale = await hre.ethers.provider.getSigner(
            gnoWhaleAddress);
        const gnoAmount = hre.ethers.utils.parseEther("600");
        await gnoToken.connect(gnoWhale).approve(realitio.address, gnoAmount);
        await realitio.connect(gnoWhale).submitAnswerERC20(question_id, "0x0000000000000000000000000000000000000000000000000000000000000001", 0, gnoAmount)
        const questionCooldown = 172800;
        await hre.ethers.provider.send("evm_increaseTime", [questionCooldown * 3]);
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [formerProposerAccount],
        });

        // Step 4: Execute proposal
        for (let proposal of proposals) {
            console.log("execution of", proposal.id)
            console.log(txsHashes[proposal.id])
            console.log(await realityModule.connect(proposer).callStatic.getTransactionHash(proposal.tx.to, proposal.tx.value, proposal.tx.data, proposal.tx.operation, proposal.id))
            assert(txsHashes[proposal.id] == await realityModule.connect(proposer).getTransactionHash(proposal.tx.to, proposal.tx.value, proposal.tx.data, proposal.tx.operation, proposal.id))
            await realityModule.connect(proposer).executeProposalWithIndex(proposalId, txsHashes, proposal.tx.to, proposal.tx.value, proposal.tx.data, proposal.tx.operation, proposal.id)
        }
    });
});


export async function getGNOToken({
    ethers,
}: HardhatRuntimeEnvironment): Promise<Contract> {
    const contract = new Contract(
        "0x6810e776880C02933D47DB1b9fc05908e5386b96",
        '[{"inputs":[{"internalType":"uint256","name":"chainId_","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"src","type":"address"},{"indexed":true,"internalType":"address","name":"guy","type":"address"},{"indexed":false,"internalType":"uint256","name":"wad","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":true,"inputs":[{"indexed":true,"internalType":"bytes4","name":"sig","type":"bytes4"},{"indexed":true,"internalType":"address","name":"usr","type":"address"},{"indexed":true,"internalType":"bytes32","name":"arg1","type":"bytes32"},{"indexed":true,"internalType":"bytes32","name":"arg2","type":"bytes32"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"}],"name":"LogNote","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"src","type":"address"},{"indexed":true,"internalType":"address","name":"dst","type":"address"},{"indexed":false,"internalType":"uint256","name":"wad","type":"uint256"}],"name":"Transfer","type":"event"},{"constant":true,"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"PERMIT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"burn","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"guy","type":"address"}],"name":"deny","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"mint","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"src","type":"address"},{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"move","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"holder","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"nonce","type":"uint256"},{"internalType":"uint256","name":"expiry","type":"uint256"},{"internalType":"bool","name":"allowed","type":"bool"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"pull","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"push","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"guy","type":"address"}],"name":"rely","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"src","type":"address"},{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"version","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"wards","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}]',
    ).connect(ethers.provider);

    return contract;
}

export async function getRealityModule({
    ethers,
}: HardhatRuntimeEnvironment): Promise<Contract> {
    const contract = new Contract(
        "0x0eBaC21F7f6A6599B5fa5f57Baaa974ADFEC4613",
        '[{"inputs":[{"internalType":"contract Executor","name":"_executor","type":"address"},{"internalType":"contract Realitio","name":"_oracle","type":"address"},{"internalType":"uint32","name":"timeout","type":"uint32"},{"internalType":"uint32","name":"cooldown","type":"uint32"},{"internalType":"uint32","name":"expiration","type":"uint32"},{"internalType":"uint256","name":"bond","type":"uint256"},{"internalType":"uint256","name":"templateId","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"questionId","type":"bytes32"},{"indexed":true,"internalType":"string","name":"proposalId","type":"string"}],"name":"ProposalQuestionCreated","type":"event"},{"inputs":[],"name":"DOMAIN_SEPARATOR_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"INVALIDATED","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"TRANSACTION_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"string","name":"proposalId","type":"string"},{"internalType":"bytes32[]","name":"txHashes","type":"bytes32[]"}],"name":"addProposal","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"string","name":"proposalId","type":"string"},{"internalType":"bytes32[]","name":"txHashes","type":"bytes32[]"},{"internalType":"uint256","name":"nonce","type":"uint256"}],"name":"addProposalWithNonce","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"answerExpiration","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"string","name":"proposalId","type":"string"},{"internalType":"bytes32[]","name":"txHashes","type":"bytes32[]"}],"name":"buildQuestion","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"string","name":"proposalId","type":"string"},{"internalType":"bytes32[]","name":"txHashes","type":"bytes32[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"enum Enum.Operation","name":"operation","type":"uint8"}],"name":"executeProposal","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"string","name":"proposalId","type":"string"},{"internalType":"bytes32[]","name":"txHashes","type":"bytes32[]"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"enum Enum.Operation","name":"operation","type":"uint8"},{"internalType":"uint256","name":"txIndex","type":"uint256"}],"name":"executeProposalWithIndex","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"","type":"bytes32"},{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"executedProposalTransactions","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"executor","outputs":[{"internalType":"contract Executor","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"enum Enum.Operation","name":"operation","type":"uint8"},{"internalType":"uint256","name":"nonce","type":"uint256"}],"name":"generateTransactionHashData","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getChainId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"templateId","type":"uint256"},{"internalType":"string","name":"question","type":"string"},{"internalType":"address","name":"arbitrator","type":"address"},{"internalType":"uint32","name":"timeout","type":"uint32"},{"internalType":"uint32","name":"openingTs","type":"uint32"},{"internalType":"uint256","name":"nonce","type":"uint256"}],"name":"getQuestionId","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"enum Enum.Operation","name":"operation","type":"uint8"},{"internalType":"uint256","name":"nonce","type":"uint256"}],"name":"getTransactionHash","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"string","name":"proposalId","type":"string"},{"internalType":"bytes32[]","name":"txHashes","type":"bytes32[]"}],"name":"markProposalAsInvalid","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"questionHash","type":"bytes32"}],"name":"markProposalAsInvalidByHash","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"questionHash","type":"bytes32"}],"name":"markProposalWithExpiredAnswerAsInvalid","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"minimumBond","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"oracle","outputs":[{"internalType":"contract Realitio","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"questionArbitrator","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"questionCooldown","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"questionIds","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"questionTimeout","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint32","name":"expiration","type":"uint32"}],"name":"setAnswerExpiration","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"arbitrator","type":"address"}],"name":"setArbitrator","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"bond","type":"uint256"}],"name":"setMinimumBond","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint32","name":"cooldown","type":"uint32"}],"name":"setQuestionCooldown","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint32","name":"timeout","type":"uint32"}],"name":"setQuestionTimeout","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"templateId","type":"uint256"}],"name":"setTemplate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"template","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]',
    ).connect(ethers.provider);

    return contract;
}

export async function getRealityIO({
    ethers,
}: HardhatRuntimeEnvironment): Promise<Contract> {
    const contract = new Contract(
        "0x8f1CC53bf34932591177CDA24723486205CA7510",
        '[{"constant":false,"inputs":[{"name":"question_id","type":"bytes32"},{"name":"history_hashes","type":"bytes32[]"},{"name":"addrs","type":"address[]"},{"name":"bonds","type":"uint256[]"},{"name":"answers","type":"bytes32[]"}],"name":"claimWinnings","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"question_id","type":"bytes32"},{"name":"tokens","type":"uint256"}],"name":"fundAnswerBountyERC20","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"},{"name":"content_hash","type":"bytes32"},{"name":"arbitrator","type":"address"},{"name":"min_timeout","type":"uint32"},{"name":"min_bond","type":"uint256"}],"name":"getFinalAnswerIfMatches","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_token","type":"address"}],"name":"setToken","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getBounty","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getArbitrator","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getBond","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"question_ids","type":"bytes32[]"},{"name":"lengths","type":"uint256[]"},{"name":"hist_hashes","type":"bytes32[]"},{"name":"addrs","type":"address[]"},{"name":"bonds","type":"uint256[]"},{"name":"answers","type":"bytes32[]"}],"name":"claimMultipleAndWithdrawBalance","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"question_id","type":"bytes32"},{"name":"answer","type":"bytes32"},{"name":"max_previous","type":"uint256"},{"name":"tokens","type":"uint256"}],"name":"submitAnswerERC20","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"withdraw","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"question_id","type":"bytes32"},{"name":"answer","type":"bytes32"},{"name":"nonce","type":"uint256"},{"name":"bond","type":"uint256"}],"name":"submitAnswerReveal","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"fee","type":"uint256"}],"name":"setQuestionFee","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"template_hashes","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getContentHash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"question_claims","outputs":[{"name":"payee","type":"address"},{"name":"last_bond","type":"uint256"},{"name":"queued_funds","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"arbitrator_question_fees","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"template_id","type":"uint256"},{"name":"question","type":"string"},{"name":"arbitrator","type":"address"},{"name":"timeout","type":"uint32"},{"name":"opening_ts","type":"uint32"},{"name":"nonce","type":"uint256"}],"name":"askQuestion","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"isFinalized","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getHistoryHash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"commitments","outputs":[{"name":"reveal_ts","type":"uint32"},{"name":"is_revealed","type":"bool"},{"name":"revealed_answer","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"content","type":"string"}],"name":"createTemplate","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getBestAnswer","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"isPendingArbitration","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"questions","outputs":[{"name":"content_hash","type":"bytes32"},{"name":"arbitrator","type":"address"},{"name":"opening_ts","type":"uint32"},{"name":"timeout","type":"uint32"},{"name":"finalize_ts","type":"uint32"},{"name":"is_pending_arbitration","type":"bool"},{"name":"bounty","type":"uint256"},{"name":"best_answer","type":"bytes32"},{"name":"history_hash","type":"bytes32"},{"name":"bond","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getOpeningTS","outputs":[{"name":"","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getTimeout","outputs":[{"name":"","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"content","type":"string"},{"name":"question","type":"string"},{"name":"arbitrator","type":"address"},{"name":"timeout","type":"uint32"},{"name":"opening_ts","type":"uint32"},{"name":"nonce","type":"uint256"}],"name":"createTemplateAndAskQuestion","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getFinalAnswer","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"question_id","type":"bytes32"},{"name":"answer_hash","type":"bytes32"},{"name":"max_previous","type":"uint256"},{"name":"_answerer","type":"address"},{"name":"tokens","type":"uint256"}],"name":"submitAnswerCommitmentERC20","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"getFinalizeTS","outputs":[{"name":"","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"templates","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"question_id","type":"bytes32"}],"name":"resultFor","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"template_id","type":"uint256"},{"name":"question","type":"string"},{"name":"arbitrator","type":"address"},{"name":"timeout","type":"uint32"},{"name":"opening_ts","type":"uint32"},{"name":"nonce","type":"uint256"},{"name":"tokens","type":"uint256"}],"name":"askQuestionERC20","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"question_id","type":"bytes32"},{"name":"requester","type":"address"},{"name":"max_previous","type":"uint256"}],"name":"notifyOfArbitrationRequest","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"token","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"question_id","type":"bytes32"},{"name":"answer","type":"bytes32"},{"name":"answerer","type":"address"}],"name":"submitAnswerByArbitrator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"name":"arbitrator","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"LogSetQuestionFee","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"template_id","type":"uint256"},{"indexed":true,"name":"user","type":"address"},{"indexed":false,"name":"question_text","type":"string"}],"name":"LogNewTemplate","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"question_id","type":"bytes32"},{"indexed":true,"name":"user","type":"address"},{"indexed":false,"name":"template_id","type":"uint256"},{"indexed":false,"name":"question","type":"string"},{"indexed":true,"name":"content_hash","type":"bytes32"},{"indexed":false,"name":"arbitrator","type":"address"},{"indexed":false,"name":"timeout","type":"uint32"},{"indexed":false,"name":"opening_ts","type":"uint32"},{"indexed":false,"name":"nonce","type":"uint256"},\
      {"indexed":false,"name":"created","type":"uint256"}],"name":"LogNewQuestion","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"question_id","type":"bytes32"},{"indexed":false,"name":"bounty_added","type":"uint256"},{"indexed":false,"name":"bounty","type":"uint256"},{"indexed":true,"name":"user","type":"address"}],"name":"LogFundAnswerBounty","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"answer","type":"bytes32"},{"indexed":true,"name":"question_id","type":"bytes32"},{"indexed":false,"name":"history_hash","type":"bytes32"},{"indexed":true,"name":"user","type":"address"},{"indexed":false,"name":"bond","type":"uint256"},{"indexed":false,"name":"ts","type":"uint256"},{"indexed":false,"name":"is_commitment","type":"bool"}],"name":"LogNewAnswer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"question_id","type":"bytes32"},{"indexed":true,"name":"user","type":"address"},{"indexed":true,"name":"answer_hash","type":"bytes32"},{"indexed":false,"name":"answer","type":"bytes32"},{"indexed":false,"name":"nonce","type":"uint256"},{"indexed":false,"name":"bond","type":"uint256"}],"name":"LogAnswerReveal","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"question_id","type":"bytes32"},{"indexed":true,"name":"user","type":"address"}],"name":"LogNotifyOfArbitrationRequest","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"question_id","type":"bytes32"},{"indexed":true,"name":"answer","type":"bytes32"}],"name":"LogFinalize","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"question_id","type":"bytes32"},{"indexed":true,"name":"user","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"LogClaim","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"user","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"LogWithdraw","type":"event"}]',
    ).connect(ethers.provider);

    return contract;
}