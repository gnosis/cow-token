import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20.json";
import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { constants, Contract, ContractFactory } from "ethers";
import { artifacts, ethers, waffle } from "hardhat";
import { Artifact } from "hardhat/types";

import {
  constructorInput,
  ContractName,
  metadata,
  DeploymentHelperDeployParams,
  getDeployArgsFromVirtualToken,
  VirtualTokenDeployParams,
} from "../src/ts";

import { stringify } from "./utils/formatUtils";

describe("BridgedTokenDeployer", () => {
  let bridgedTokenDeployer: Contract;
  let gnoToken: MockContract;
  let multiTokenMediatorGnosisChain: MockContract;
  let wrappedNativeToken: MockContract;
  let cowProtocolVirtualToken: Contract;
  let BridgedTokenDeployer: ContractFactory;
  let MultiTokenMediatorGnosisChain: Artifact;

  const [deployer] = waffle.provider.getWallets();

  const merkleRoot = "0x" + "42".repeat(32);
  const communityFundsTarget = "0x" + "42".repeat(3).padEnd(38, "0") + "01";
  const bridgedCowTokenAddress = "0x" + "26".repeat(20);
  const foreignToken = "0x" + "13".repeat(20);
  const gnoPrice = "42";
  const nativeTokenPrice = "1337";
  let deploymentParams: DeploymentHelperDeployParams;

  beforeEach(async () => {
    gnoToken = await waffle.deployMockContract(deployer, IERC20.abi);
    wrappedNativeToken = await waffle.deployMockContract(deployer, IERC20.abi);
    MultiTokenMediatorGnosisChain = await artifacts.readArtifact(
      "BridgedTokensRegistry",
    );
    multiTokenMediatorGnosisChain = await waffle.deployMockContract(
      deployer,
      MultiTokenMediatorGnosisChain.abi,
    );
    BridgedTokenDeployer = (
      await ethers.getContractFactory(ContractName.BridgedTokenDeployer)
    ).connect(deployer);
    deploymentParams = {
      foreignToken,
      merkleRoot,
      multiTokenMediatorGnosisChain: multiTokenMediatorGnosisChain.address,
      gnoToken: gnoToken.address,
      wrappedNativeToken: wrappedNativeToken.address,
      communityFundsTarget,
      gnoPrice,
      nativeTokenPrice,
    };
  });

  describe("constructor parameters", async function () {
    beforeEach(async function () {
      await multiTokenMediatorGnosisChain.mock.bridgedTokenAddress.returns(
        bridgedCowTokenAddress,
      );
      bridgedTokenDeployer = await BridgedTokenDeployer.deploy(
        ...constructorInput(
          ContractName.BridgedTokenDeployer,
          deploymentParams,
        ),
      );
    });

    it("has expected merkle root", async () => {
      expect(await bridgedTokenDeployer.merkleRoot()).to.equal(merkleRoot);
    });

    it("has expected multiTokenMediator", async () => {
      expect(await bridgedTokenDeployer.multiTokenMediator()).to.equal(
        multiTokenMediatorGnosisChain.address,
      );
    });

    it("has expected real cowToken", async () => {
      expect(await bridgedTokenDeployer.foreignToken()).to.equal(foreignToken);
    });

    it("sets the expected community funds target", async function () {
      expect(await bridgedTokenDeployer.communityFundsTarget()).to.equal(
        communityFundsTarget,
      );
    });

    it("sets the expected GNO token", async function () {
      expect(await bridgedTokenDeployer.gnoToken()).to.equal(gnoToken.address);
    });

    it("sets the expected GNO price", async function () {
      expect(await bridgedTokenDeployer.gnoPrice()).to.equal(gnoPrice);
    });

    it("sets the expected wrapped native token", async function () {
      expect(await bridgedTokenDeployer.wrappedNativeToken()).to.equal(
        wrappedNativeToken.address,
      );
    });

    it("sets the expected native token price", async function () {
      expect(await bridgedTokenDeployer.nativeTokenPrice()).to.equal(
        nativeTokenPrice,
      );
    });
  });

  describe("deploy", async function () {
    it("reverts if the bridged contract does not yet exists", async () => {
      await multiTokenMediatorGnosisChain.mock.bridgedTokenAddress.returns(
        constants.AddressZero,
      );
      bridgedTokenDeployer = await BridgedTokenDeployer.deploy(
        ...constructorInput(
          ContractName.BridgedTokenDeployer,
          deploymentParams,
        ),
      );
      await expect(bridgedTokenDeployer.deploy()).to.be.revertedWith(
        "cowToken not yet bridged",
      );
    });

    it("reverts if the call to the bridge contract reverts", async () => {
      await multiTokenMediatorGnosisChain.mock.bridgedTokenAddress.revertsWithReason(
        "reverted",
      );
      bridgedTokenDeployer = await BridgedTokenDeployer.deploy(
        ...constructorInput(
          ContractName.BridgedTokenDeployer,
          deploymentParams,
        ),
      );
      await expect(bridgedTokenDeployer.deploy()).to.be.revertedWith(
        "reverted",
      );
    });

    it("deploys a new contract if the bridge contract exists", async () => {
      await multiTokenMediatorGnosisChain.mock.bridgedTokenAddress.returns(
        bridgedCowTokenAddress,
      );
      bridgedTokenDeployer = await BridgedTokenDeployer.deploy(
        ...constructorInput(
          ContractName.BridgedTokenDeployer,
          deploymentParams,
        ),
      );
      await expect(bridgedTokenDeployer.deploy()).to.be.not.reverted;
    });
  });

  describe("deployed CowProtocolVirtualToken", async function () {
    beforeEach(async function () {
      await multiTokenMediatorGnosisChain.mock.bridgedTokenAddress.returns(
        bridgedCowTokenAddress,
      );
      bridgedTokenDeployer = await BridgedTokenDeployer.deploy(
        ...constructorInput(
          ContractName.BridgedTokenDeployer,
          deploymentParams,
        ),
      );
      const vCowAddress = await bridgedTokenDeployer.callStatic.deploy();
      await bridgedTokenDeployer.deploy();
      cowProtocolVirtualToken = await ethers.getContractAt(
        "CowProtocolVirtualToken",
        vCowAddress,
      );
    });

    it("has expected name", async () => {
      expect(await cowProtocolVirtualToken.name()).to.equal(
        metadata.virtual.name,
      );
    });

    it("has expected symbol", async () => {
      expect(await cowProtocolVirtualToken.symbol()).to.equal(
        metadata.virtual.symbol,
      );
    });

    it("has 18 decimals", async () => {
      expect(await cowProtocolVirtualToken.decimals()).to.equal(
        metadata.virtual.decimals,
      );
    });

    it("has expected deployment params", async function () {
      const onchainDeploymentParams = await getDeployArgsFromVirtualToken(
        cowProtocolVirtualToken,
      );
      const expected: VirtualTokenDeployParams = {
        merkleRoot,
        usdcToken: constants.AddressZero,
        realToken: bridgedCowTokenAddress,
        communityFundsTarget: communityFundsTarget,
        investorFundsTarget: constants.AddressZero,
        gnoToken: gnoToken.address,
        gnoPrice: gnoPrice,
        usdcPrice: "0",
        nativeTokenPrice,
        wrappedNativeToken: wrappedNativeToken.address,
        teamController: constants.AddressZero,
      };
      expect(stringify(onchainDeploymentParams)).to.deep.equal(expected);
    });
  });
});
