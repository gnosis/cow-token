import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";

import {
  constructorInput,
  ContractName,
  metadata,
  RealTokenDeployParams,
} from "../src/ts";

describe("CowProtocolToken", () => {
  let token: Contract;
  let cowDao: Wallet;
  const totalSupply = ethers.utils.parseUnits("31337", 18);

  beforeEach(async () => {
    [cowDao] = await waffle.provider.getWallets();

    const CowProtocolToken = await ethers.getContractFactory(
      ContractName.RealToken,
    );
    const constructorParams: RealTokenDeployParams = {
      initialTokenHolder: "0x" + "42".repeat(20),
      cowDao: cowDao.address,
      totalSupply,
    };
    token = await CowProtocolToken.deploy(
      ...constructorInput(ContractName.RealToken, constructorParams),
    );
  });

  it("has expected name", async () => {
    expect(await token.name()).to.equal(metadata.real.name);
  });

  it("has expected symbol", async () => {
    expect(await token.symbol()).to.equal(metadata.real.symbol);
  });
});
