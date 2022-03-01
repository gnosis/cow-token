import { Contract, ContractFactory } from "@ethersproject/contracts";
import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20.json";
import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { ethers, waffle } from "hardhat";

import makeSwappableExampleSettings from "../example/test-make-vcow-swappable.json";
import { execSafeTransaction } from "../src/tasks/ts/safe";
import {
  groupMultipleTransactions,
  generateMakeSwappableProposal,
  MakeSwappableSettings,
} from "../src/ts";

import { RevertMessage } from "./custom-errors";
import { GnosisSafeManager } from "./safe";

const [deployer, gnosisDaoOwner, executor] = waffle.provider.getWallets();

// Test at compile time that the example file has the expected format.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _makeSwappableTypeCheck: MakeSwappableSettings =
  makeSwappableExampleSettings;

describe("make swappable proposal", function () {
  let cowDao: Contract;
  let multiTokenMediator: Contract;
  let cowToken: MockContract;
  let gnosisSafeManager: GnosisSafeManager;
  let settings: MakeSwappableSettings;
  let OmniBridgeTransferSimulator: ContractFactory;

  before(async function () {
    gnosisSafeManager = await GnosisSafeManager.init(deployer);
    OmniBridgeTransferSimulator = await ethers.getContractFactory(
      "OmniBridgeTransferSimulator",
      deployer,
    );

    cowDao = await (
      await gnosisSafeManager.newSafe([gnosisDaoOwner.address], 1)
    ).connect(executor);
  });

  beforeEach(async function () {
    cowToken = await waffle.deployMockContract(deployer, IERC20.abi);
    multiTokenMediator = await OmniBridgeTransferSimulator.deploy();

    settings = {
      cowToken: cowToken.address,
      virtualCowToken: "0x" + "42".repeat(20),
      atomsToTransfer: "31337",
      multisend: gnosisSafeManager.multisend.address,
      multiTokenMediator: multiTokenMediator.address,
      bridged: {
        virtualCowToken: "0x" + "21".repeat(20),
        atomsToTransfer: "1337",
      },
    };
  });

  // Returns an array that assigns to each makeSwappable proposal (flattened)
  // step the mocks it needs for its execution.
  const preparedMocks = [
    [
      () =>
        cowToken.mock.transfer
          .withArgs(settings.virtualCowToken, settings.atomsToTransfer)
          .returns(true),
    ],
    [
      () =>
        cowToken.mock.approve
          .withArgs(
            settings.multiTokenMediator,
            settings.bridged.atomsToTransfer,
          )
          .returns(true),
    ],
    [
      () =>
        cowToken.mock.transferFrom
          .withArgs(
            cowDao.address,
            settings.multiTokenMediator,
            settings.bridged.atomsToTransfer,
          )
          .returns(true),
    ],
  ];

  it("executes successfully", async function () {
    for (const mock of preparedMocks.flat()) {
      await mock();
    }

    const { steps } = await generateMakeSwappableProposal(settings, ethers);
    for (const step of groupMultipleTransactions(
      steps,
      gnosisSafeManager.multisend.address,
    )) {
      await expect(execSafeTransaction(cowDao, step, [gnosisDaoOwner])).not.to
        .be.reverted;
    }
  });

  // We want to test that each mock is used at its step to make sure that the
  // mock contract was called at the expected point. This is done by testing
  // that execution reverts with "uninitialized mock" if the mock is not set.
  async function expectUninitializedMockAtIndex(revertIndex: number) {
    const steps = (
      await generateMakeSwappableProposal(settings, ethers)
    ).steps.flat();

    for (let index = 0; index < revertIndex; index++) {
      expect(Object.keys(preparedMocks)).to.include(index.toString());
      for (const mock of preparedMocks[index]) {
        await mock();
      }

      await expect(
        executor.sendTransaction({
          to: steps[index].to,
          data: steps[index].data,
        }),
      ).not.to.be.reverted;
    }

    await expect(
      executor.sendTransaction({
        to: steps[revertIndex].to,
        data: steps[revertIndex].data,
      }),
    ).to.be.revertedWith(RevertMessage.UninitializedMock);
  }

  it("transfers COW to vCOW", async function () {
    await expectUninitializedMockAtIndex(0);
  });

  it("approves the DAO for sending COW to the multibridge", async function () {
    await expectUninitializedMockAtIndex(1);
  });

  it("the multibridge withdraws COW from the Cow DAO", async function () {
    await expectUninitializedMockAtIndex(2);
  });
});
