import GnosisSafe from "@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";
import CompatibilityFallbackHandler from "@gnosis.pm/safe-contracts/build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json";
import CreateCall from "@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/CreateCall.sol/CreateCall.json";
import MultiSend from "@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json";
import GnosisSafeProxyFactory from "@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json";
import { Signer, Contract } from "ethers";
import { ethers, waffle } from "hardhat";

import { SafeDeploymentAddresses } from "../src/ts/lib/safe";

export class GnosisSafeManager {
  constructor(
    public readonly deployer: Signer,
    public readonly singleton: Contract,
    public readonly multisend: Contract,
    public readonly proxyFactory: Contract,
    public readonly createCall: Contract,
    public readonly fallbackHandler: Contract,
  ) {}

  public static async init(deployer: Signer): Promise<GnosisSafeManager> {
    const singleton = await waffle.deployContract(deployer, GnosisSafe);
    const proxyFactory = await waffle.deployContract(
      deployer,
      GnosisSafeProxyFactory,
    );
    const multisend = await waffle.deployContract(deployer, MultiSend);
    const createCall = await waffle.deployContract(deployer, CreateCall);
    const fallbackHandler = await waffle.deployContract(
      deployer,
      CompatibilityFallbackHandler,
    );
    return new GnosisSafeManager(
      deployer,
      singleton,
      multisend,
      proxyFactory,
      createCall,
      fallbackHandler,
    );
  }

  public async newSafe(owners: string[], threshold: number): Promise<Contract> {
    const proxyCreationInput = [this.singleton.address, "0x"];
    const proxyAddress = await this.proxyFactory.callStatic.createProxy(
      ...proxyCreationInput,
    );
    await this.proxyFactory.createProxy(...proxyCreationInput);
    const safe = await ethers.getContractAt(GnosisSafe.abi, proxyAddress);
    await safe.setup(
      owners,
      threshold,
      ethers.constants.AddressZero,
      "0x",
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      ethers.constants.AddressZero,
    );
    return safe;
  }

  public getDeploymentAddresses(): SafeDeploymentAddresses {
    return {
      singleton: this.singleton.address,
      factory: this.proxyFactory.address,
      fallbackHandler: this.fallbackHandler.address,
    };
  }
}
