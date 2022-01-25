import { Contract, ContractFactory } from "@ethersproject/contracts";
import { expect } from "chai";
import { constants, utils } from "ethers";
import { Interface } from "ethers/lib/utils";
import { waffle, ethers } from "hardhat";

import {
  ContractName,
  getDeterministicDeploymentTransaction,
  getForwardIfNoCodeAtInput,
} from "../src/ts";

import { setupDeployer as setupDeterministicDeployer } from "./deterministic-deployment";

const [deployer] = waffle.provider.getWallets();

describe("Forwarder", function () {
  let forwarder: Contract;
  let eventEmitter: Contract;
  let EventEmitterFactory: ContractFactory;

  beforeEach(async function () {
    // Note: using an actual contract instead of a mock because it is not
    // possible to easily test that a function was indeed call in the mock.
    // This is not supported by Hardhat:
    // https://ethereum-waffle.readthedocs.io/en/latest/matchers.html#called-on-contract
    EventEmitterFactory = (
      await ethers.getContractFactory("EventEmitter")
    ).connect(deployer);
    eventEmitter = await EventEmitterFactory.deploy();

    const ForwardFactory = (
      await ethers.getContractFactory("Forwarder")
    ).connect(deployer);
    forwarder = await ForwardFactory.deploy();
  });

  it("forwards call if there is no code at target", async function () {
    const callArgs = ["0x" + "42".repeat(20), "0xca11da7a", 42];
    expect(await ethers.provider.getCode(constants.AddressZero)).to.equal("0x");

    const tx = {
      data: EventEmitterFactory.interface.encodeFunctionData(
        "emitEvent",
        callArgs,
      ),
      to: eventEmitter.address,
    };
    await expect(
      forwarder.forwardIfNoCodeAt(
        ...getForwardIfNoCodeAtInput({
          addressToTest: constants.AddressZero,
          transaction: tx,
        }),
      ),
    )
      .to.emit(eventEmitter, "Event")
      .withArgs(...callArgs);
  });

  it("does not forward call if target has code", async function () {
    const contract = await waffle.deployMockContract(deployer, []);
    expect(await ethers.provider.getCode(contract.address)).not.to.equal("0x");

    const tx = {
      data: "0x",
      to: eventEmitter.address,
    };

    await expect(
      forwarder.forwardIfNoCodeAt(
        ...getForwardIfNoCodeAtInput({
          addressToTest: contract.address,
          transaction: tx,
        }),
      ),
    ).not.to.emit(eventEmitter, "Event");
  });

  it("reverts if forwarded call reverts", async function () {
    const abi = ["function revert()"];
    const reverterInterface = new Interface(abi);
    const reverter = await waffle.deployMockContract(deployer, abi);

    expect(await ethers.provider.getCode(constants.AddressZero)).to.equal("0x");
    await reverter.mock.revert.reverts();
    const tx = {
      data: reverterInterface.encodeFunctionData("revert"),
      to: eventEmitter.address,
    };

    await expect(
      forwarder.forwardIfNoCodeAt(
        ...getForwardIfNoCodeAtInput({
          addressToTest: constants.AddressZero,
          transaction: tx,
        }),
      ),
    ).to.be.revertedWith("Forwarded call failed");
  });

  it("computes deterministic deployment address", async function () {
    const salt = utils.id("deployment in test");
    await setupDeterministicDeployer(deployer);
    const { safeTransaction, address } =
      await getDeterministicDeploymentTransaction(
        ContractName.Forwarder,
        {},
        ethers,
        salt,
      );
    expect(await ethers.provider.getCode(address)).to.equal("0x");
    await deployer.sendTransaction({
      to: safeTransaction.to,
      data: safeTransaction.data,
    });
    expect(await ethers.provider.getCode(address)).not.to.equal("0x");
  });
});
