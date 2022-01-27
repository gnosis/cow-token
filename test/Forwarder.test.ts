import { Contract, ContractFactory } from "@ethersproject/contracts";
import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { expect } from "chai";
import { constants, utils } from "ethers";
import { Interface } from "ethers/lib/utils";
import { waffle, ethers } from "hardhat";

import {
  callIfContractExists,
  ContractName,
  DEFAULT_FORWARDER,
  getDeterministicDeploymentTransaction,
  getForwardCallIfNoCodeAtInput,
} from "../src/ts";
import { SafeOperation } from "../src/ts/lib/safe";

import { setupDeployer as setupDeterministicDeployer } from "./deterministic-deployment";
import { skipOnCoverage } from "./test-management";

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
      forwarder.forwardCallIfNoCodeAt(
        ...getForwardCallIfNoCodeAtInput({
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
      forwarder.forwardCallIfNoCodeAt(
        ...getForwardCallIfNoCodeAtInput({
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
      forwarder.forwardCallIfNoCodeAt(
        ...getForwardCallIfNoCodeAtInput({
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

describe("callIfContractExists", function () {
  const basicMetatransaction: MetaTransaction = {
    to: constants.AddressZero,
    data: "0x",
    operation: SafeOperation.Call,
    value: 0,
  };

  it("wraps call around the forwarder", async function () {
    const ForwardFactory = (
      await ethers.getContractFactory("Forwarder")
    ).connect(deployer);
    const forwarder = await ForwardFactory.deploy();

    const addressToTest = "0x" + "42".repeat(20);
    const transaction: MetaTransaction = {
      data: "0xca11da7a",
      to: "0x" + "21".repeat(20),
      operation: SafeOperation.Call,
      value: 0,
    };

    expect(
      callIfContractExists({ addressToTest, transaction, forwarder }),
    ).to.deep.equal({
      data: forwarder.interface.encodeFunctionData(
        "forwardCallIfNoCodeAt",
        getForwardCallIfNoCodeAtInput({
          addressToTest,
          transaction: transaction,
        }),
      ),
      to: forwarder.address,
      operation: SafeOperation.Call,
      value: constants.Zero,
    });
  });

  it("reverts if operation is delegatecall", function () {
    expect(() =>
      callIfContractExists({
        addressToTest: constants.AddressZero,
        transaction: {
          ...basicMetatransaction,
          operation: SafeOperation.DelegateCall,
        },
        forwarder: "unused" as unknown as Contract,
      }),
    ).to.throw(Error, "Forwarder can only forward pure calls");
  });

  it("reverts if eth-value is nonzero", function () {
    expect(() =>
      callIfContractExists({
        addressToTest: constants.AddressZero,
        transaction: {
          ...basicMetatransaction,
          value: 1,
        },
        forwarder: "unused" as unknown as Contract,
      }),
    ).to.throw(Error, "Forwarder cannot forward any ETH value");
  });
});

describe("default forwarder", function () {
  it("has expected address [skip-in-coverage]", async function () {
    // Needs to be skipped in coverage as inserting the artifacts to check lines
    // for coverage changes the bytecode, and with it the final address.
    skipOnCoverage.call(this);

    const { address } = await getDeterministicDeploymentTransaction(
      ContractName.Forwarder,
      {},
      ethers,
      constants.HashZero,
    );
    expect(DEFAULT_FORWARDER).to.equal(address);
  });
});
