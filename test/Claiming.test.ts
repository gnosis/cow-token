import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20.json";
import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { BigNumber, constants, Contract, ContractFactory, utils } from "ethers";
import { ethers, waffle } from "hardhat";

import {
  ClaimType,
  constructorInput,
  ContractName,
  ContructorInput,
  VirtualTokenDeployParams,
} from "../src/ts";

import { customError, RevertMessage } from "./custom-errors";
import { setTime } from "./utils/timeUtils";

const FREE_CLAIM_EXPIRATION = 6 * 7 * 24 * 3600; // six weeks
const PAID_OPTION_EXPIRATION = 2 * 7 * 24 * 3600; // two weeks

type ClaimingDeploymentParams = Omit<VirtualTokenDeployParams, "merkleRoot">;
type ClaimingConstructorInput =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ContructorInput[ContractName.VirtualToken] extends [infer _, ...infer Rest]
    ? Rest
    : never;

function claimingConstructorInput(
  params: ClaimingDeploymentParams,
): ClaimingConstructorInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_merkleRoot, ...rest] = constructorInput(ContractName.VirtualToken, {
    merkleRoot: "merkle root is unused",
    ...params,
  });
  return rest;
}

describe("Claiming", function () {
  let claiming: Contract;
  let Claiming: ContractFactory;
  let realToken: MockContract;
  let usdcToken: MockContract;
  let gnoToken: MockContract;
  let wethToken: MockContract;

  let deploymentTimestamp: number;

  const [deployer, executor, ownsNoVirtualTokens, teamController] =
    waffle.provider.getWallets();
  const claimant = "0x" + "42".repeat(3).padEnd(38, "0") + "00";
  const payer = "0x" + "42".repeat(3).padEnd(38, "0") + "01";
  const communityFundsTarget = "0x" + "42".repeat(3).padEnd(38, "0") + "02";
  const investorFundsTarget = "0x" + "42".repeat(3).padEnd(38, "0") + "03";
  // Prices are chosen to be realistic but yet easy to work with, so that the
  // test amounts are meaningful.
  // - 1 COW = 0.1 USDC
  // - 1 GNO = 400 USDC
  // - 1 WETH = 4000 USDC
  const usdcPrice = utils.parseUnits("0.1", 6);
  const gnoPrice = utils.parseUnits("1", 18).div(4000);
  const wethPrice = utils.parseUnits("1", 18).div(40000);
  let deploymentParams: ClaimingDeploymentParams;

  beforeEach(async function () {
    realToken = await waffle.deployMockContract(deployer, IERC20.abi);
    usdcToken = await waffle.deployMockContract(deployer, IERC20.abi);
    gnoToken = await waffle.deployMockContract(deployer, IERC20.abi);
    wethToken = await waffle.deployMockContract(deployer, IERC20.abi);

    deploymentParams = {
      realToken: realToken.address,
      gnoToken: gnoToken.address,
      usdcToken: usdcToken.address,
      wethToken: wethToken.address,
      communityFundsTarget,
      investorFundsTarget,
      usdcPrice,
      gnoPrice,
      wethPrice,
      teamController: teamController.address,
    };

    Claiming = await ethers.getContractFactory("ClaimingTestInterface");
    claiming = (
      await Claiming.deploy(
        ...(await claimingConstructorInput(deploymentParams)),
      )
    ).connect(executor);
    deploymentTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
  });

  it("sets the expected real token", async function () {
    expect(await claiming.cowToken()).to.equal(realToken.address);
  });

  it("sets the expected community funds target", async function () {
    expect(await claiming.communityFundsTarget()).to.equal(
      communityFundsTarget,
    );
  });

  it("sets the expected USDC token", async function () {
    expect(await claiming.usdcToken()).to.equal(usdcToken.address);
  });

  it("sets the expected USDC price", async function () {
    expect(await claiming.usdcPrice()).to.equal(usdcPrice);
  });

  it("sets the expected GNO token", async function () {
    expect(await claiming.gnoToken()).to.equal(gnoToken.address);
  });

  it("sets the expected GNO price", async function () {
    expect(await claiming.gnoPrice()).to.equal(gnoPrice);
  });

  it("sets the expected WETH token", async function () {
    expect(await claiming.wethToken()).to.equal(wethToken.address);
  });

  it("sets the expected WETH price", async function () {
    expect(await claiming.wethPrice()).to.equal(wethPrice);
  });

  it("sets the expected team controller", async function () {
    expect(await claiming.teamController()).to.equal(teamController.address);
  });

  it("sets the expected deployment timestamp", async function () {
    expect(await claiming.deploymentTimestamp()).to.equal(deploymentTimestamp);
  });

  it("has zero starting total supply", async function () {
    expect(await claiming.totalSupply()).to.equal(constants.Zero);
  });

  describe("performClaim", function () {
    const claimedAmount = utils.parseUnits("31337", 18);

    it("reverts for out-of-range claim type", async function () {
      const fistFreeClaimType = Object.keys(ClaimType).length / 2;
      await expect(
        claiming.performClaimTest(
          fistFreeClaimType,
          payer,
          claimant,
          constants.One,
          constants.Zero,
        ),
      ).to.be.revertedWith("function was called with incorrect parameters");
    });

    describe(ClaimType[ClaimType.Airdrop], function () {
      it("claims all tokens as instantly swappable", async function () {
        expect(
          await claiming.instantlySwappableBalance(claimant),
        ).to.deep.equal(constants.Zero);
        await claiming.performClaimTest(
          ClaimType.Airdrop,
          payer,
          claimant,
          claimedAmount,
          constants.Zero,
        );
        expect(
          await claiming.instantlySwappableBalance(claimant),
        ).to.deep.equal(claimedAmount);
      });

      it("increases total supply", async function () {
        // Make initial total supply larger than zero to make sure it increases
        const initialSupply = utils.parseUnits("3133333337", 18);
        await claiming.addInstantlySwappableTokens(
          "0x" + "42".repeat(20),
          initialSupply,
        );

        expect(await claiming.totalSupply()).to.deep.equal(initialSupply);
        await claiming.performClaimTest(
          ClaimType.Airdrop,
          payer,
          claimant,
          claimedAmount,
          constants.Zero,
        );
        expect(await claiming.totalSupply()).to.deep.equal(
          initialSupply.add(claimedAmount),
        );
      });

      it("emits token generation event", async function () {
        await expect(
          await claiming.performClaimTest(
            ClaimType.Airdrop,
            payer,
            claimant,
            claimedAmount,
            constants.Zero,
          ),
        )
          .to.emit(claiming, "Transfer")
          .withArgs(constants.AddressZero, claimant, claimedAmount);
      });

      it("can be claimed until immediately before the deadline", async function () {
        await setTime(deploymentTimestamp + FREE_CLAIM_EXPIRATION);
        await expect(
          claiming.performClaimTest(
            ClaimType.Airdrop,
            payer,
            claimant,
            constants.One,
            constants.Zero,
          ),
        ).not.to.be.reverted;
      });

      it("cannot be claimed after deadline", async function () {
        await setTime(deploymentTimestamp + FREE_CLAIM_EXPIRATION + 1);
        await expect(
          claiming.performClaimTest(
            ClaimType.Airdrop,
            payer,
            claimant,
            constants.One,
            constants.Zero,
          ),
        ).to.be.revertedWith(customError("ClaimingExpired"));
      });

      it("reverts if sending ETH when claiming", async function () {
        await expect(
          claiming.performClaimTest(
            ClaimType.Airdrop,
            payer,
            claimant,
            claimedAmount,
            constants.One,
          ),
        ).to.be.revertedWith(customError("CannotSendEth"));
      });
    });

    interface OptionTestParams {
      claimType: ClaimType;
      isCancelable: boolean;
      expiration: number;
    }
    function testOptionClaim(
      testParams: OptionTestParams,
      ethAmount: BigNumber = constants.Zero,
    ) {
      const amount = utils.parseUnits("36000", 18);

      it("executes successfully", async function () {
        await expect(
          claiming.performClaimTest(
            testParams.claimType,
            payer,
            claimant,
            amount,
            ethAmount,
          ),
        ).not.to.be.reverted;
      });

      it("claims no tokens as instantly swappable", async function () {
        await claiming.performClaimTest(
          testParams.claimType,
          payer,
          claimant,
          amount,
          ethAmount,
        );
        expect(await claiming.instantlySwappableBalance(claimant)).to.equal(0);
      });

      it("increases total supply", async function () {
        await claiming.performClaimTest(
          testParams.claimType,
          payer,
          claimant,
          amount,
          ethAmount,
        );

        expect(await claiming.totalSupply()).to.deep.equal(amount);
      });

      it(`adds new ${
        testParams.isCancelable ? "non-" : ""
      }cancelable vesting position`, async function () {
        await expect(
          claiming.performClaimTest(
            testParams.claimType,
            payer,
            claimant,
            amount,
            ethAmount,
          ),
        )
          .to.emit(claiming, "AddedVesting")
          .withArgs(claimant, amount, testParams.isCancelable);
      });

      it("emits token generation event", async function () {
        await expect(
          claiming.performClaimTest(
            testParams.claimType,
            payer,
            claimant,
            amount,
            ethAmount,
          ),
        )
          .to.emit(claiming, "Transfer")
          .withArgs(constants.AddressZero, claimant, amount);
      });

      it("can be claimed until immediately before the deadline", async function () {
        await setTime(deploymentTimestamp + testParams.expiration);
        await expect(
          claiming.performClaimTest(
            testParams.claimType,
            payer,
            claimant,
            amount,
            ethAmount,
          ),
        ).not.to.be.reverted;
      });

      it("cannot be claimed after deadline", async function () {
        await setTime(deploymentTimestamp + testParams.expiration + 1);
        await expect(
          claiming.performClaimTest(
            testParams.claimType,
            payer,
            claimant,
            amount,
            ethAmount,
          ),
        ).to.be.revertedWith(customError("ClaimingExpired"));
      });
    }

    function testFreeOptionClaim(testParams: OptionTestParams) {
      describe(ClaimType[testParams.claimType], function () {
        testOptionClaim(testParams);

        it("reverts if sending ETH when claiming", async function () {
          await expect(
            claiming.performClaimTest(
              testParams.claimType,
              payer,
              claimant,
              claimedAmount,
              constants.One,
            ),
          ).to.be.revertedWith(customError("CannotSendEth"));
        });
      });
    }

    const priceDenominator = BigNumber.from(10).pow(18);
    interface PaidOptionTestParams extends OptionTestParams {
      paymentTokenName: string;
      price: BigNumber;
      fundsTarget: "communityFunds" | "investorFunds";
      acceptsEthAt?: BigNumber;
    }
    function target(fundsTarget: "communityFunds" | "investorFunds"): string {
      switch (fundsTarget) {
        case "communityFunds":
          return communityFundsTarget;
        case "investorFunds":
          return investorFundsTarget;
        default:
          throw new Error("Invalid funds target");
      }
    }
    function token(tokenName: string): Contract {
      switch (tokenName) {
        case "USDC":
          return usdcToken;
        case "GNO":
          return gnoToken;
        case "WETH":
          return wethToken;
        default:
          throw new Error("Invalid token");
      }
    }

    function testPaidOptionClaim(testParams: PaidOptionTestParams) {
      describe(ClaimType[testParams.claimType], function () {
        const amount = utils.parseUnits("36000", 18);
        const proceeds = amount.mul(testParams.price).div(priceDenominator);

        it(`withdraws ${testParams.paymentTokenName} from the transaction executor to the ${testParams.fundsTarget} target`, async function () {
          await expect(
            claiming.performClaimTest(
              testParams.claimType,
              payer,
              claimant,
              amount,
              constants.Zero,
            ),
          ).to.be.revertedWith(RevertMessage.UninitializedMock);

          await token(testParams.paymentTokenName)
            .mock.transferFrom.withArgs(
              payer,
              target(testParams.fundsTarget),
              proceeds,
            )
            .returns(true);

          await expect(
            claiming.performClaimTest(
              testParams.claimType,
              payer,
              claimant,
              amount,
              constants.Zero,
            ),
          ).not.to.be.reverted;
        });

        it(`reverts if ${testParams.paymentTokenName} withdrawal fails`, async function () {
          await token(testParams.paymentTokenName)
            .mock.transferFrom.withArgs(
              payer,
              target(testParams.fundsTarget),
              proceeds,
            )
            .revertsWithReason("failed transfer");

          await expect(
            claiming.performClaimTest(
              testParams.claimType,
              payer,
              claimant,
              amount,
              constants.Zero,
            ),
          ).to.be.revertedWith("failed transfer");
        });

        if (testParams.acceptsEthAt !== undefined) {
          const ethProceeds = amount
            .mul(testParams.acceptsEthAt)
            .div(priceDenominator);

          describe("can use ETH for claiming", async function () {
            beforeEach(async function () {
              // Transfer eth to contract, so that it can actually perform the
              // transfer.
              await executor.sendTransaction({
                to: claiming.address,
                value: ethProceeds,
              });
            });

            testOptionClaim(testParams, ethProceeds);
          });

          it("reverts if sending too little ETH", async function () {
            await expect(
              claiming.performClaimTest(
                testParams.claimType,
                payer,
                claimant,
                amount,
                ethProceeds.sub(1),
              ),
            ).to.be.revertedWith(customError("InvalidEthAmount"));
          });

          it("reverts if sending too much ETH", async function () {
            await expect(
              claiming.performClaimTest(
                testParams.claimType,
                payer,
                claimant,
                amount,
                ethProceeds.add(1),
              ),
            ).to.be.revertedWith(customError("InvalidEthAmount"));
          });

          it("reverts if ETH transfer fails", async function () {
            const nonPayableContract = await (
              await ethers.getContractFactory("NonPayable")
            ).deploy();

            const updatedDeploymentParams = { ...deploymentParams };
            updatedDeploymentParams[
              testParams.fundsTarget === "communityFunds"
                ? "communityFundsTarget"
                : "investorFundsTarget"
            ] = nonPayableContract.address;
            claiming = (
              await Claiming.deploy(
                ...(await claimingConstructorInput(updatedDeploymentParams)),
              )
            ).connect(executor);

            // Transfer eth to contract, so that it can actually perform the
            // transfer.
            await executor.sendTransaction({
              to: claiming.address,
              value: ethProceeds,
            });

            await expect(
              claiming.performClaimTest(
                testParams.claimType,
                payer,
                claimant,
                amount,
                ethProceeds,
              ),
            ).to.be.revertedWith(RevertMessage.ContractCannotReceiveEth);
          });
        } else {
          it("reverts if sending ETH when claiming", async function () {
            await expect(
              claiming.performClaimTest(
                testParams.claimType,
                payer,
                claimant,
                amount,
                constants.One,
              ),
            ).to.be.revertedWith(customError("CannotSendEth"));
          });
        }

        describe(`on successful ${testParams.paymentTokenName} transfer`, function () {
          beforeEach(async function () {
            await token(testParams.paymentTokenName)
              .mock.transferFrom.withArgs(
                payer,
                target(testParams.fundsTarget),
                proceeds,
              )
              .returns(true);
          });

          testOptionClaim(testParams);
        });
      });
    }

    testPaidOptionClaim({
      claimType: ClaimType.GnoOption,
      isCancelable: false,
      expiration: PAID_OPTION_EXPIRATION,
      paymentTokenName: "GNO",
      price: gnoPrice,
      fundsTarget: "communityFunds",
    });

    testPaidOptionClaim({
      claimType: ClaimType.UserOption,
      isCancelable: false,
      expiration: PAID_OPTION_EXPIRATION,
      paymentTokenName: "WETH",
      price: wethPrice,
      acceptsEthAt: wethPrice,
      fundsTarget: "communityFunds",
    });

    testPaidOptionClaim({
      claimType: ClaimType.Investor,
      isCancelable: false,
      expiration: PAID_OPTION_EXPIRATION,
      paymentTokenName: "USDC",
      price: usdcPrice,
      fundsTarget: "investorFunds",
    });

    testFreeOptionClaim({
      claimType: ClaimType.Team,
      isCancelable: true,
      expiration: FREE_CLAIM_EXPIRATION,
    });

    testFreeOptionClaim({
      claimType: ClaimType.Advisor,
      isCancelable: false,
      expiration: FREE_CLAIM_EXPIRATION,
    });
  });

  function testSwap(swapFunction: "swap" | "swapAll") {
    describe(`shared expectations for ${swapFunction}`, function () {
      const availableAmount = utils.parseUnits("31337", 18);
      const swappedAmount =
        swapFunction === "swap"
          ? utils.parseUnits("1337", 18)
          : availableAmount;
      const swapArgs = swapFunction === "swap" ? [swappedAmount] : [];

      beforeEach(async function () {
        await claiming.addInstantlySwappableTokens(
          executor.address,
          availableAmount,
        );
      });

      it("reduces immediately swappable balance", async function () {
        await realToken.mock.transfer
          .withArgs(executor.address, swappedAmount)
          .returns(true);

        expect(
          await claiming.instantlySwappableBalance(executor.address),
        ).to.deep.equal(availableAmount);

        await claiming.connect(executor)[swapFunction](...swapArgs);

        expect(
          await claiming.instantlySwappableBalance(executor.address),
        ).to.deep.equal(availableAmount.sub(swappedAmount));
      });

      it("emits a Transfer event informing that virtual tokens were burned", async function () {
        await realToken.mock.transfer
          .withArgs(executor.address, swappedAmount)
          .returns(true);

        await expect(claiming.connect(executor)[swapFunction](...swapArgs))
          .to.emit(claiming, "Transfer")
          .withArgs(executor.address, constants.AddressZero, swappedAmount);
      });

      it("reduces total supply", async function () {
        // Make total supply larger than the balance of the tested user
        const extraSupply = utils.parseUnits("3133333337", 18);
        await claiming.addInstantlySwappableTokens(
          "0x" + "42".repeat(20),
          extraSupply,
        );
        const initialTotalSupply = extraSupply.add(availableAmount);
        expect(await claiming.totalSupply()).to.deep.equal(initialTotalSupply);

        await realToken.mock.transfer
          .withArgs(executor.address, swappedAmount)
          .returns(true);

        await claiming.connect(executor)[swapFunction](...swapArgs);

        expect(await claiming.totalSupply()).to.deep.equal(
          initialTotalSupply.sub(swappedAmount),
        );
      });

      it("sends real tokens to user", async function () {
        // Check first that transfer is called by seeing that the transaction
        // reverts if not mocked.
        await expect(
          claiming.connect(executor)[swapFunction](...swapArgs),
        ).to.be.revertedWith(RevertMessage.UninitializedMock);

        await realToken.mock.transfer
          .withArgs(executor.address, swappedAmount)
          .returns(true);

        await claiming.connect(executor)[swapFunction](...swapArgs);
      });

      describe("reverts if real token transfer fails", function () {
        it("by reverting", async function () {
          await realToken.mock.transfer
            .withArgs(executor.address, swappedAmount)
            .revertsWithReason("mock transfer failure");

          await expect(
            claiming.connect(executor)[swapFunction](...swapArgs),
          ).to.be.revertedWith("mock transfer failure");
        });

        it("by returning false", async function () {
          await realToken.mock.transfer
            .withArgs(executor.address, swappedAmount)
            .returns(false);

          await expect(
            claiming.connect(executor)[swapFunction](...swapArgs),
          ).to.be.revertedWith("SafeERC20: failed transfer");
        });
      });

      describe("including vesting", function () {
        const vestedAmount = utils.parseUnits("42000", 18);
        const immediatelyAvailableAmount = availableAmount;

        // Swap an amount large enough that it must be covered with both vesting
        // and immediately available amount.
        expect(vestedAmount.gt(immediatelyAvailableAmount)).to.be.true;
        const swappedAmount =
          swapFunction === "swap"
            ? vestedAmount.add(1)
            : vestedAmount.add(availableAmount);
        const swapArgs = swapFunction === "swap" ? [swappedAmount] : [];

        beforeEach(async function () {
          // Swapping virtual tokens requires an amount of tokens to have been
          // added to the contract. In particular, it requires the total supply
          // to be at least the amount that we want to test for.
          // Moreover, we mock the output of a vesting conversion to simulate
          // the expected output from the `Vesting` contract.
          await claiming.addToTotalSupply(vestedAmount);
          await claiming.mockVest(vestedAmount);
        });

        it("updates immediately swappable balance with vesting proceeds", async function () {
          await realToken.mock.transfer
            .withArgs(executor.address, swappedAmount)
            .returns(true);

          expect(
            await claiming.instantlySwappableBalance(executor.address),
          ).to.equal(availableAmount);

          await claiming.connect(executor)[swapFunction](...swapArgs);

          expect(
            await claiming.instantlySwappableBalance(executor.address),
          ).to.equal(availableAmount.add(vestedAmount).sub(swappedAmount));
        });

        it("reduces total supply", async function () {
          const initialTotalSupply = await claiming.totalSupply();

          await realToken.mock.transfer
            .withArgs(executor.address, swappedAmount)
            .returns(true);

          await claiming.connect(executor)[swapFunction](...swapArgs);

          expect(await claiming.totalSupply()).to.equal(
            initialTotalSupply.sub(swappedAmount),
          );
        });

        it("sends full amount of real tokens", async function () {
          // Check first that transfer is called by seeing that the transaction
          // reverts if not mocked.
          await expect(
            claiming.connect(executor)[swapFunction](...swapArgs),
          ).to.be.revertedWith("Mock on the method is not initialized");

          await realToken.mock.transfer
            .withArgs(executor.address, swappedAmount)
            .returns(true);

          await claiming.connect(executor)[swapFunction](...swapArgs);
        });
      });
    });
  }

  testSwap("swap");

  testSwap("swapAll");

  describe("swap", () => {
    const availableAmount = utils.parseUnits("31337", 18);

    beforeEach(async function () {
      await claiming.addInstantlySwappableTokens(
        executor.address,
        availableAmount,
      );
    });

    it("reverts if no balance can be swapped", async function () {
      expect(
        await claiming.instantlySwappableBalance(ownsNoVirtualTokens.address),
      ).to.deep.equal(constants.Zero);

      await expect(
        claiming.connect(ownsNoVirtualTokens).swap(constants.One),
      ).to.be.revertedWith(RevertMessage.OverOrUnderflow);
    });

    it("reverts if trying to swap too much balance", async function () {
      await expect(
        claiming.connect(executor).swap(availableAmount.add(1)),
      ).to.be.revertedWith(RevertMessage.OverOrUnderflow);
    });
  });

  describe("swapAll", () => {
    const availableAmount = utils.parseUnits("31337", 18);

    beforeEach(async function () {
      await claiming.addInstantlySwappableTokens(
        executor.address,
        availableAmount,
      );
    });

    it("returns swapped balance", async function () {
      await realToken.mock.transfer
        .withArgs(executor.address, availableAmount)
        .returns(true);

      expect(await claiming.connect(executor).callStatic.swapAll()).to.equal(
        availableAmount,
      );
    });

    it("returns swapped balance with vesting", async function () {
      const vestedAmount = utils.parseUnits("42000", 18);
      await claiming.addToTotalSupply(vestedAmount);
      await claiming.mockVest(vestedAmount);
      const swappedAmount = vestedAmount.add(availableAmount);

      await realToken.mock.transfer
        .withArgs(executor.address, swappedAmount)
        .returns(true);

      expect(await claiming.connect(executor).callStatic.swapAll()).to.equal(
        swappedAmount,
      );
    });
  });
});
