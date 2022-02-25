import { Contract } from "@ethersproject/contracts";
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
  let cowToken: MockContract;
  let gnosisSafeManager: GnosisSafeManager;
  let settings: MakeSwappableSettings;

  before(async function () {
    gnosisSafeManager = await GnosisSafeManager.init(deployer);

    cowDao = await (
      await gnosisSafeManager.newSafe([gnosisDaoOwner.address], 1)
    ).connect(executor);
  });

  beforeEach(async function () {
    cowToken = await waffle.deployMockContract(deployer, IERC20.abi);

    settings = {
      cowToken: cowToken.address,
      virtualCowToken: "0x" + "42".repeat(20),
      atomsToTransfer: "31337",
      multisend: gnosisSafeManager.multisend.address,
    };
  });

  it("executes successfully", async function () {
    cowToken.mock.transfer
      .withArgs(settings.virtualCowToken, settings.atomsToTransfer)
      .returns(true);

    const { steps } = await generateMakeSwappableProposal(settings, ethers);
    for (const step of groupMultipleTransactions(
      steps,
      gnosisSafeManager.multisend.address,
    )) {
      await expect(execSafeTransaction(cowDao, step, [gnosisDaoOwner])).not.to
        .be.reverted;
    }
  });

  it("transfers COW to vCOW", async function () {
    // Require that the mock in the test "executes successfully" has been
    // called. This is done by observing that without the mock the transaction
    // reverts.

    const { steps } = await generateMakeSwappableProposal(settings, ethers);
    // Assumption: the first transaction in the list is the transfer. If this
    // test fails, it might be that it has changed order.
    const [[transferCow]] = steps;
    // To help check that, we assert that `to` is the COW token.
    expect(transferCow.to).to.equal(settings.cowToken);

    await expect(
      executor.sendTransaction({ to: transferCow.to, data: transferCow.data }),
    ).to.be.revertedWith(RevertMessage.UninitializedMock);
  });
});
