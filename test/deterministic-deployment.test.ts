import { expect } from "chai";
import { ethers, waffle } from "hardhat";

import {
  DEPLOYER_CONTRACT,
  deterministicallyDeploy,
  deterministicDeploymentAddress,
} from "../src/ts";

import { setupDeployer } from "./deterministic-deployment";

describe("deterministic deployments", () => {
  const [ethSource, deployer] = waffle.provider.getWallets();

  before(async () => {
    await setupDeployer(ethSource);
  });

  it("deploys deterministically", async () => {
    const ReturnsConstructorParameter = await ethers.getContractFactory(
      "ReturnsConstructorParameter",
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const bytecode = ReturnsConstructorParameter.getDeployTransaction(42).data!;
    expect(bytecode).not.to.be.undefined;

    const salt = Array(32)
      .fill(null)
      .map((_, i) => i);

    const deploymentInfo = {
      bytecode,
      deployerContract: DEPLOYER_CONTRACT,
      salt,
    };
    const contractAddress = deterministicDeploymentAddress(deploymentInfo);

    expect(await ethers.provider.getCode(contractAddress)).to.equal("0x");
    await deterministicallyDeploy(
      deploymentInfo,
      await ethers.getSigner(deployer.address),
    );
    expect(await ethers.provider.getCode(contractAddress)).not.to.equal("0x");

    const deployedContract =
      ReturnsConstructorParameter.attach(contractAddress);
    expect(await deployedContract.ping()).to.equal(42);
  });
});
