import { expect } from "chai";
import { constants } from "ethers";
import hre, { waffle } from "hardhat";

import {
  DeploymentProposalSettings,
  VirtualTokenCreationSettings,
  SafeCreationSettings,
  generateProposal,
} from "../src/ts";
import {
  dummyBridgeParameters,
  dummyteamConrollerSettings,
  dummyVirtualTokenCreationSettings,
} from "../src/ts/lib/dummy-instantiation";

import { setupDeployer as setupDeterministicDeployer } from "./deterministic-deployment";
import { GnosisSafeManager } from "./safe";

describe("deployment of bridgedTokenDeployer", () => {
  let gnosisSafeManager: GnosisSafeManager;
  const [deployer] = waffle.provider.getWallets();

  before(async function () {
    await setupDeterministicDeployer(deployer);
    gnosisSafeManager = await GnosisSafeManager.init(deployer);
  });

  describe("relies on:", function () {
    it("invariance of cowDao and cowToken addresses from vCowToken deployment parameters", async function () {
      const cowDaoSettings: SafeCreationSettings = {
        owners: [1, 2, 3, 4, 5].map((i) => "0x".padEnd(42, i.toString())),
        threshold: 5,
      };
      const teamConrollerSettingsStandard: SafeCreationSettings = {
        owners: [6, 7, 8].map((i) => "0x".padEnd(42, i.toString())),
        threshold: 2,
      };
      const virtualTokenCreationSettingsStandard: VirtualTokenCreationSettings =
        {
          merkleRoot: "0x" + "42".repeat(32),
          usdcToken: "0x0000" + "42".repeat(17) + "01",
          gnoToken: "0x0000" + "42".repeat(17) + "02",
          gnoPrice: "31337",
          wrappedNativeToken: "0x0000" + "42".repeat(17) + "03",
          nativeTokenPrice: "42424242",
        };
      const gnosisDao = "0x" + "29".repeat(20);
      const settingsStandard: DeploymentProposalSettings = {
        gnosisDao: gnosisDao,
        cowDao: cowDaoSettings,
        teamController: teamConrollerSettingsStandard,
        cowToken: {},
        virtualCowToken: virtualTokenCreationSettingsStandard,
        bridge: dummyBridgeParameters,
      };
      const settingsSimplified: DeploymentProposalSettings = {
        gnosisDao: gnosisDao,
        cowDao: cowDaoSettings,
        teamController: dummyteamConrollerSettings,
        cowToken: {},
        virtualCowToken: dummyVirtualTokenCreationSettings,
        bridge: dummyBridgeParameters,
      };

      const deploymentAddresses = {
        ...gnosisSafeManager.getDeploymentAddresses(),
        forwarder: "0x" + "f0".repeat(20),
      };
      const { addresses: addressesStandard } = await generateProposal(
        settingsStandard,
        deploymentAddresses,
        deploymentAddresses,
        hre.ethers,
      );
      const dummyDeploymentAddresses = {
        ...gnosisSafeManager.getDeploymentAddresses(),
        forwarder: constants.AddressZero,
      };
      const { addresses: addressesSimplified } = await generateProposal(
        settingsSimplified,
        dummyDeploymentAddresses,
        dummyDeploymentAddresses,
        hre.ethers,
      );
      expect(addressesStandard.cowDao).to.be.equal(addressesSimplified.cowDao);
      expect(addressesStandard.cowToken).to.be.equal(
        addressesSimplified.cowToken,
      );
    });
  });
});
