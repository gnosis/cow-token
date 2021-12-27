import { expect } from "chai";
import { BigNumber, constants, Contract, ContractFactory, utils } from "ethers";
import { ethers, waffle } from "hardhat";

import {
  Claim,
  ClaimType,
  computeProofs,
  ExecutableClaim,
  getClaimInput,
  getClaimManyInput,
} from "../src/ts/claim";

import { fullyExecuteClaim } from "./claiming";
import { customError, RevertMessage } from "./custom-errors";

describe("MerkleDistributor", () => {
  let MerkleDistributor: ContractFactory;

  const [deployer, executor] = waffle.provider.getWallets();

  // Using two claims because the proof for a single-entry Merkel tree is empty,
  // which means that not much is tested.
  const claim: Claim = {
    account: "0x" + "42".repeat(20),
    claimableAmount: BigNumber.from(1337),
    type: ClaimType.Investor,
  };
  const extraClaim: Claim = {
    account: "0x" + "21".repeat(20),
    claimableAmount: BigNumber.from(31337),
    type: ClaimType.GnoOption,
  };

  beforeEach(async () => {
    MerkleDistributor = await ethers.getContractFactory(
      "MerkleDistributorTestInterface",
    );
  });

  it("can be claimed with a valid proof", async () => {
    const {
      merkleRoot,
      claims: [claimWithProof],
    } = computeProofs([claim, extraClaim]);
    const distributor = (
      await MerkleDistributor.connect(deployer).deploy(merkleRoot)
    ).connect(executor);

    await expect(
      distributor.claim(...getClaimInput(fullyExecuteClaim(claimWithProof))),
    )
      .to.emit(distributor, "HasClaimed")
      .withArgs(
        claimWithProof.type,
        executor.address,
        claimWithProof.account,
        claimWithProof.claimableAmount,
        constants.Zero,
      );
  });

  it("passes along the transaction value", async () => {
    const value = utils.parseEther("42");
    const {
      merkleRoot,
      claims: [claimWithProof],
    } = computeProofs([claim, extraClaim]);
    const distributor = (
      await MerkleDistributor.connect(deployer).deploy(merkleRoot)
    ).connect(executor);

    await expect(
      distributor.claim(...getClaimInput(fullyExecuteClaim(claimWithProof)), {
        value,
      }),
    )
      .to.emit(distributor, "HasClaimed")
      .withArgs(
        claimWithProof.type,
        executor.address,
        claimWithProof.account,
        claimWithProof.claimableAmount,
        value,
      );
  });

  it("can be claimed partially if the caller is the owner", async () => {
    const partialClaim = {
      account: executor.address,
      claimableAmount: BigNumber.from(1337),
      type: ClaimType.Team,
    };
    const { merkleRoot, claims } = computeProofs([partialClaim, extraClaim]);
    const distributor = (
      await MerkleDistributor.connect(deployer).deploy(merkleRoot)
    ).connect(executor);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const provenPartialClaim = claims.find(
      ({ account }) => account == executor.address,
    )!;
    expect(provenPartialClaim).not.to.be.undefined;
    const executablePartialClaim = {
      ...provenPartialClaim,
      claimedAmount: provenPartialClaim.claimableAmount.div(2),
    };

    await expect(distributor.claim(...getClaimInput(executablePartialClaim)))
      .to.emit(distributor, "HasClaimed")
      .withArgs(
        partialClaim.type,
        executor.address,
        partialClaim.account,
        executablePartialClaim.claimedAmount,
        constants.Zero,
      );
  });

  it("cannot be claimed twice", async () => {
    const {
      merkleRoot,
      claims: [claimWithProof],
    } = computeProofs([claim, extraClaim]);
    const distributor = (await MerkleDistributor.deploy(merkleRoot)).connect(
      executor,
    );

    const input = getClaimInput(fullyExecuteClaim(claimWithProof));
    await distributor.claim(...input);
    await expect(distributor.claim(...input)).to.be.revertedWith(
      customError("AlreadyClaimed"),
    );
  });

  it("cannot claim more than maximum claimable amount", async () => {
    const {
      merkleRoot,
      claims: [claimWithProof],
    } = computeProofs([claim, extraClaim]);
    const distributor = (
      await MerkleDistributor.connect(deployer).deploy(merkleRoot)
    ).connect(executor);

    await expect(
      distributor.claim(
        ...getClaimInput({
          ...claimWithProof,
          claimedAmount: claimWithProof.claimableAmount.add(1),
        }),
      ),
    ).to.be.revertedWith(customError("ClaimingMoreThanMaximum"));
  });

  it("cannot be claimed partially if the caller is not the owner", async () => {
    const {
      merkleRoot,
      claims: [claimWithProof],
    } = computeProofs([claim, extraClaim]);
    const distributor = (
      await MerkleDistributor.connect(deployer).deploy(merkleRoot)
    ).connect(executor);

    await expect(
      distributor.claim(
        ...getClaimInput({
          ...claimWithProof,
          claimedAmount: claimWithProof.claimableAmount.div(2),
        }),
      ),
    ).to.be.revertedWith(customError("OnlyOwnerCanClaimPartially"));
  });

  it("cannot be claimed with a bad proof", async () => {
    const {
      merkleRoot,
      claims: [claimWithProof],
    } = computeProofs([claim, extraClaim]);
    const distributor = (await MerkleDistributor.deploy(merkleRoot)).connect(
      executor,
    );

    expect(claimWithProof.proof).to.have.length(1);
    // The smallest change should make the proof invalid
    const proof = ethers.utils.arrayify(claimWithProof.proof[0]);
    proof[0] += 1;

    await expect(
      distributor.claim(
        ...getClaimInput({
          ...claim,
          claimedAmount: claim.claimableAmount,
          index: claimWithProof.index,
          proof: [ethers.utils.hexlify(proof)],
        }),
      ),
    ).to.be.revertedWith(customError("InvalidProof"));
  });

  it("emits a dedicated event on claiming", async () => {
    const partialClaim = {
      account: executor.address,
      claimableAmount: BigNumber.from(1337),
      type: ClaimType.Team,
    };
    const { merkleRoot, claims } = computeProofs([partialClaim, extraClaim]);
    const distributor = (
      await MerkleDistributor.connect(deployer).deploy(merkleRoot)
    ).connect(executor);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const provenPartialClaim = claims.find(
      ({ account }) => account == executor.address,
    )!;
    expect(provenPartialClaim).not.to.be.undefined;
    const executedClaim: ExecutableClaim = {
      ...provenPartialClaim,
      claimedAmount: provenPartialClaim.claimableAmount.div(2),
    };

    await expect(distributor.claim(...getClaimInput(executedClaim)))
      .to.emit(distributor, "Claimed")
      .withArgs(
        executedClaim.index,
        executedClaim.type,
        executedClaim.account,
        executedClaim.claimableAmount,
        executedClaim.claimedAmount,
      );
  });

  it("works for multiple claims", async () => {
    // This test tries to make multiple claims with different parameters and
    // tests that each claim is being executed as expected.
    // It also uses a large number of claims so that we use an entire byte of
    // the mapping `claimedBitMap` and parts of an extra byte.
    const claims: Claim[] = Array(300)
      .fill(undefined)
      .map((_, i) => ({
        account: ethers.utils.getAddress(
          "0x" + (i % 256).toString(16).padStart(2, "0").repeat(20),
        ),
        claimableAmount: BigNumber.from(31337 * i),
        type: i % (Object.keys(ClaimType).length / 2),
      }));
    const { merkleRoot, claims: claimsWithProof } = computeProofs(claims);
    const distributor = (await MerkleDistributor.deploy(merkleRoot)).connect(
      executor,
    );

    const executedClaims: ExecutableClaim[] = claimsWithProof.map(
      (claim, i) => ({
        ...fullyExecuteClaim(claim),
        value: i % 3 == 0 ? undefined : BigNumber.from(43 * i),
      }),
    );

    for (const executedClaim of executedClaims) {
      expect(await distributor.isClaimed(executedClaim.index)).to.be.false;
      const transactionOverrides =
        executedClaim.value !== undefined
          ? [{ value: executedClaim.value }]
          : [];
      await expect(
        distributor.claim(
          ...getClaimInput(executedClaim),
          ...transactionOverrides,
        ),
      )
        .to.emit(distributor, "HasClaimed")
        .withArgs(
          executedClaim.type,
          executor.address,
          executedClaim.account,
          executedClaim.claimedAmount,
          executedClaim.value ?? constants.Zero,
        );
      expect(await distributor.isClaimed(executedClaim.index)).to.be.true;
    }
  });

  describe("claim bundling", function () {
    const claim1: Claim = {
      account: "0x" + "42".repeat(20),
      claimableAmount: BigNumber.from(1337),
      type: ClaimType.Investor,
    };
    const claim2: Claim = {
      account: "0x" + "21".repeat(20),
      claimableAmount: BigNumber.from(31337),
      type: ClaimType.Investor,
    };
    const claim3: Claim = {
      account: "0x" + "12".repeat(20),
      claimableAmount: BigNumber.from(133337),
      type: ClaimType.Team,
    };
    const { merkleRoot, claims: claimsWithProof } = computeProofs([
      claim1,
      claim2,
      claim3,
    ]);

    let distributor: Contract;

    this.beforeEach(async function () {
      distributor = (await MerkleDistributor.deploy(merkleRoot)).connect(
        executor,
      );
    });

    it("performs each claim in bundle", async function () {
      await expect(
        distributor.claimMany(
          ...getClaimManyInput([
            fullyExecuteClaim(claimsWithProof[0]),
            fullyExecuteClaim(claimsWithProof[1]),
          ]),
        ),
      )
        .to.emit(distributor, "HasClaimed")
        .withArgs(
          claimsWithProof[0].type,
          executor.address,
          claimsWithProof[0].account,
          claimsWithProof[0].claimableAmount,
          constants.Zero,
        )
        .and.to.emit(distributor, "HasClaimed")
        .withArgs(
          claimsWithProof[1].type,
          executor.address,
          claimsWithProof[1].account,
          claimsWithProof[1].claimableAmount,
          constants.Zero,
        );

      expect(await distributor.isClaimed(claimsWithProof[0].index)).to.be.true;
      expect(await distributor.isClaimed(claimsWithProof[1].index)).to.be.true;
    });

    it("bundles partial claim with full claim", async function () {
      const partialClaim: Claim = {
        account: executor.address,
        claimableAmount: BigNumber.from(1337),
        type: ClaimType.Investor,
      };
      const fullClaim: Claim = {
        account: "0x" + "21".repeat(20),
        claimableAmount: BigNumber.from(31337),
        type: ClaimType.Investor,
      };

      const { merkleRoot, claims: claimsWithProof } = computeProofs([
        partialClaim,
        fullClaim,
      ]);

      distributor = (await MerkleDistributor.deploy(merkleRoot)).connect(
        executor,
      );

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const provenPartialClaim = claimsWithProof.find(
        ({ account }) => account == executor.address,
      )!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const provenFullClaim = claimsWithProof.find(
        ({ account }) => account != executor.address,
      )!;
      expect(provenPartialClaim).not.to.be.undefined;
      expect(provenFullClaim).not.to.be.undefined;

      const executablePartialClaim = {
        ...provenPartialClaim,
        claimedAmount: provenPartialClaim.claimableAmount.div(2),
      };
      const executableFullClaim = fullyExecuteClaim(provenFullClaim);

      await expect(
        distributor.claimMany(
          ...getClaimManyInput([executablePartialClaim, executableFullClaim]),
        ),
      )
        .to.emit(distributor, "HasClaimed")
        .withArgs(
          executablePartialClaim.type,
          executor.address,
          executablePartialClaim.account,
          executablePartialClaim.claimedAmount,
          constants.Zero,
        )
        .and.to.emit(distributor, "HasClaimed")
        .withArgs(
          executableFullClaim.type,
          executor.address,
          executableFullClaim.account,
          executableFullClaim.claimedAmount,
          constants.Zero,
        );

      expect(await distributor.isClaimed(executablePartialClaim.index)).to.be
        .true;
      expect(await distributor.isClaimed(executableFullClaim.index)).to.be.true;
    });

    it("allows using eth to claim", async function () {
      const {
        merkleRoot,
        claims: [provenClaim1, provenClaim2, provenClaimNoEth],
      } = computeProofs([claim1, claim2, claim3]);
      distributor = (await MerkleDistributor.deploy(merkleRoot)).connect(
        executor,
      );

      const executedClaim1 = {
        ...fullyExecuteClaim(provenClaim1),
        value: BigNumber.from(424242),
      };
      const executedClaim2 = {
        ...fullyExecuteClaim(provenClaim2),
        value: BigNumber.from(242424),
      };
      const executedClaimNoEth = fullyExecuteClaim(provenClaimNoEth);

      await expect(
        distributor.claimMany(
          ...getClaimManyInput([
            executedClaim1,
            executedClaim2,
            executedClaimNoEth,
          ]),
          { value: executedClaim1.value.add(executedClaim2.value) },
        ),
      )
        .to.emit(distributor, "HasClaimed")
        .withArgs(
          executedClaim1.type,
          executor.address,
          executedClaim1.account,
          executedClaim1.claimedAmount,
          executedClaim1.value,
        )
        .to.emit(distributor, "HasClaimed")
        .withArgs(
          executedClaim2.type,
          executor.address,
          executedClaim2.account,
          executedClaim2.claimedAmount,
          executedClaim2.value,
        )
        .to.emit(distributor, "HasClaimed")
        .withArgs(
          executedClaimNoEth.type,
          executor.address,
          executedClaimNoEth.account,
          executedClaimNoEth.claimedAmount,
          constants.Zero,
        );

      expect(await distributor.isClaimed(executedClaim1.index)).to.be.true;
      expect(await distributor.isClaimed(executedClaim2.index)).to.be.true;
      expect(await distributor.isClaimed(executedClaimNoEth.index)).to.be.true;
    });

    it("reverts if the amount of eth sent is not correct", async function () {
      const {
        merkleRoot,
        claims: [provenClaim1, provenClaim2],
      } = computeProofs([claim1, claim2]);
      distributor = (await MerkleDistributor.deploy(merkleRoot)).connect(
        executor,
      );

      const value1 = utils.parseEther("42");
      const value2 = utils.parseEther("21");
      await expect(
        distributor.claimMany(
          ...getClaimManyInput([
            {
              ...fullyExecuteClaim(provenClaim1),
              value: value1,
            },
            {
              ...fullyExecuteClaim(provenClaim2),
              value: value2,
            },
          ]),
          { value: value1.add(value2).sub(1) },
        ),
      ).to.be.revertedWith(customError("InvalidEthValue"));

      await expect(
        distributor.claimMany(
          ...getClaimManyInput([
            {
              ...fullyExecuteClaim(provenClaim1),
              value: value1,
            },
            {
              ...fullyExecuteClaim(provenClaim2),
              value: value2,
            },
          ]),
          { value: value1.add(value2).add(1) },
        ),
      ).to.be.revertedWith(customError("InvalidEthValue"));
    });

    describe("if input arrays have different length", function () {
      it("uses length of first input vector to pick claims, ignoring extra entries", async function () {
        const input = getClaimManyInput([
          fullyExecuteClaim(claimsWithProof[0]),
          fullyExecuteClaim(claimsWithProof[1]),
        ]);
        input[0].pop();

        await expect(distributor.claimMany(...input))
          .to.emit(distributor, "HasClaimed")
          .withArgs(
            claimsWithProof[0].type,
            executor.address,
            claimsWithProof[0].account,
            claimsWithProof[0].claimableAmount,
            constants.Zero,
          );

        expect(await distributor.isClaimed(claimsWithProof[0].index)).to.be
          .true;
        expect(await distributor.isClaimed(claimsWithProof[1].index)).to.be
          .false;
      });

      it("reverts if any input vector is shorter than the first vector", async function () {
        const input = getClaimManyInput([
          fullyExecuteClaim(claimsWithProof[0]),
          fullyExecuteClaim(claimsWithProof[1]),
        ]);
        input[1].pop();

        await expect(distributor.claimMany(...input)).to.be.revertedWith(
          RevertMessage.ArrayIndexOutOfBound,
        );
      });
    });
  });

  describe("ClaimType", () => {
    let distributor: Contract;
    const typeCount = Object.keys(ClaimType).length / 2;

    beforeEach(async () => {
      distributor = await MerkleDistributor.deploy("0x" + "00".repeat(32));
    });

    it("has consistent options with enum", async () => {
      for (let i = 0; i < typeCount; i++) {
        expect(await distributor.claimName(i)).to.equal(ClaimType[i]);
      }
    });

    it("no options is left out of enum", async () => {
      await expect(distributor.claimName(typeCount)).to.be.reverted;
    });
  });
});
