import { TransactionResponse } from "@ethersproject/abstract-provider";
import {
  buildSafeTransaction,
  executeTxWithSigners,
  MetaTransaction,
} from "@gnosis.pm/safe-contracts";
import GnosisSafe from "@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";
import MultiSend from "@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json";
import GnosisSafeProxyFactory from "@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json";
import { Signer, Contract, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";

export class GnosisSafeManager {
  constructor(
    public readonly deployer: Signer,
    public readonly singleton: Contract,
    public readonly multisend: Contract,
    public readonly proxyFactory: Contract,
  ) {}

  public static async init(deployer: Signer): Promise<GnosisSafeManager> {
    const singleton = await waffle.deployContract(deployer, GnosisSafe);
    const proxyFactory = await waffle.deployContract(
      deployer,
      GnosisSafeProxyFactory,
    );
    const multisend = await waffle.deployContract(deployer, MultiSend);
    return new GnosisSafeManager(deployer, singleton, multisend, proxyFactory);
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
}

export async function execSafeTransaction(
  safe: Contract,
  transaction: MetaTransaction,
  signers: Wallet[],
): Promise<TransactionResponse> {
  const safeTransaction = buildSafeTransaction({
    ...transaction,
    nonce: await safe.nonce(),
  });

  return await executeTxWithSigners(safe, safeTransaction, signers);
}
