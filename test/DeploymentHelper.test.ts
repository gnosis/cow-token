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
} from "../src/ts";

describe("DeploymentHelper", () => {
  let deploymentHelper: Contract;
  let gnoToken: MockContract;
  let multiTokenMediatorHome: MockContract;
  let wrappedNativeToken: MockContract;
  let cowProtocolVirtualToken: Contract;
  let DeploymentHelper: ContractFactory;
  let MultiTokenMediatorHome: Artifact;

  const [deployer] = waffle.provider.getWallets();

  const merkleRoot = "0x" + "42".repeat(32);
  const communityFundsTarget = "0x" + "42".repeat(3).padEnd(38, "0") + "01";
  const bridgedCowTokenAddress = "0x" + "26".repeat(20);
  const foreignToken = "0x" + "13".repeat(20);
  const gnoPrice = 42;
  const nativeTokenPrice = 1337;
  let deploymentParams: DeploymentHelperDeployParams;

  beforeEach(async () => {
    gnoToken = await waffle.deployMockContract(deployer, IERC20.abi);
    wrappedNativeToken = await waffle.deployMockContract(deployer, IERC20.abi);
    MultiTokenMediatorHome = await artifacts.readArtifact(
      "MultiTokenMediatorInterface",
    );
    multiTokenMediatorHome = await waffle.deployMockContract(
      deployer,
      MultiTokenMediatorHome.abi,
    );
    DeploymentHelper = (
      await ethers.getContractFactory(ContractName.DeploymentHelper)
    ).connect(deployer);
    deploymentParams = {
      foreignToken,
      merkleRoot,
      multiTokenMediatorHome: multiTokenMediatorHome.address,
      gnoToken: gnoToken.address,
      wrappedNativeToken: wrappedNativeToken.address,
      communityFundsTarget,
      gnoPrice,
      nativeTokenPrice,
    };
  });

  describe("constructor parameters", async function () {
    beforeEach(async function () {
      await multiTokenMediatorHome.mock.bridgedTokenAddress.returns(
        bridgedCowTokenAddress,
      );
      deploymentHelper = await DeploymentHelper.deploy(
        ...constructorInput(ContractName.DeploymentHelper, deploymentParams),
      );
    });

    it("has expected merkle root", async () => {
      expect(await deploymentHelper.merkleRoot()).to.equal(merkleRoot);
    });

    it("has expected multiTokenMediator", async () => {
      expect(await deploymentHelper.multiTokenMediator()).to.equal(
        multiTokenMediatorHome.address,
      );
    });

    it("has expected real deploymentHelper", async () => {
      expect(await deploymentHelper.foreignToken()).to.equal(foreignToken);
    });

    it("sets the expected community funds target", async function () {
      expect(await deploymentHelper.communityFundsTarget()).to.equal(
        communityFundsTarget,
      );
    });

    it("sets the expected GNO deploymentHelper", async function () {
      expect(await deploymentHelper.gnoToken()).to.equal(gnoToken.address);
    });

    it("sets the expected GNO price", async function () {
      expect(await deploymentHelper.gnoPrice()).to.equal(gnoPrice);
    });

    it("sets the expected wrapped native deploymentHelper", async function () {
      expect(await deploymentHelper.wrappedNativeToken()).to.equal(
        wrappedNativeToken.address,
      );
    });

    it("sets the expected native deploymentHelper price", async function () {
      expect(await deploymentHelper.nativeTokenPrice()).to.equal(
        nativeTokenPrice,
      );
    });
  });

  describe("deploy", async function () {
    it("reverts if the bridge contract does not yet exists", async () => {
      await multiTokenMediatorHome.mock.bridgedTokenAddress.returns(
        constants.AddressZero,
      );
      deploymentHelper = await DeploymentHelper.deploy(
        ...constructorInput(ContractName.DeploymentHelper, deploymentParams),
      );
      await expect(deploymentHelper.deploy()).to.be.revertedWith(
        "cowToken not yet bridged",
      );
    });

    it("deploys a new contracts if the bridge contract does exists", async () => {
      await multiTokenMediatorHome.mock.bridgedTokenAddress.returns(
        bridgedCowTokenAddress,
      );
      deploymentHelper = await DeploymentHelper.deploy(
        ...constructorInput(ContractName.DeploymentHelper, deploymentParams),
      );
      await expect(deploymentHelper.deploy()).to.be.not.reverted;
    });
  });

  describe("deployed CowProtocolVirtualToken", async function () {
    beforeEach(async function () {
      await multiTokenMediatorHome.mock.bridgedTokenAddress.returns(
        bridgedCowTokenAddress,
      );
      deploymentHelper = await DeploymentHelper.deploy(
        ...constructorInput(ContractName.DeploymentHelper, deploymentParams),
      );
      const vCowAddress = await deploymentHelper.callStatic.deploy();
      await deploymentHelper.deploy();
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

    it("has expected merkle root", async () => {
      expect(await cowProtocolVirtualToken.merkleRoot()).to.equal(merkleRoot);
    });

    it("has expected real deploymentHelper", async () => {
      expect(await cowProtocolVirtualToken.cowToken()).to.equal(
        bridgedCowTokenAddress,
      );
    });

    it("sets the expected community funds target", async function () {
      expect(await cowProtocolVirtualToken.communityFundsTarget()).to.equal(
        communityFundsTarget,
      );
    });

    it("sets the expected USDC deploymentHelper", async function () {
      expect(await cowProtocolVirtualToken.usdcToken()).to.equal(
        constants.AddressZero,
      );
    });

    it("sets the expected USDC price", async function () {
      expect(await cowProtocolVirtualToken.usdcPrice()).to.equal(0);
    });

    it("sets the expected GNO deploymentHelper", async function () {
      expect(await cowProtocolVirtualToken.gnoToken()).to.equal(
        gnoToken.address,
      );
    });

    it("sets the expected GNO price", async function () {
      expect(await cowProtocolVirtualToken.gnoPrice()).to.equal(gnoPrice);
    });

    it("sets the expected wrapped native deploymentHelper", async function () {
      expect(await cowProtocolVirtualToken.wrappedNativeToken()).to.equal(
        wrappedNativeToken.address,
      );
    });

    it("sets the expected native deploymentHelper price", async function () {
      expect(await cowProtocolVirtualToken.nativeTokenPrice()).to.equal(
        nativeTokenPrice,
      );
    });

    it("sets the expected team controller", async function () {
      expect(await cowProtocolVirtualToken.teamController()).to.equal(
        constants.AddressZero,
      );
    });
  });
});