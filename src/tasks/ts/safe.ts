import { TransactionResponse } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import {
  buildSafeTransaction,
  executeTxWithSigners,
  MetaTransaction,
} from "@gnosis.pm/safe-contracts";
import GnosisSafe from "@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";
import GnosisSafeProxyFactory from "@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json";
import GnosisSafeDeployment from "@gnosis.pm/safe-deployments/src/assets/v1.3.0/gnosis_safe.json";
import MultiSendDeployment from "@gnosis.pm/safe-deployments/src/assets/v1.3.0/multi_send_call_only.json";
import GnosisSafeProxyFactoryDeployment from "@gnosis.pm/safe-deployments/src/assets/v1.3.0/proxy_factory.json";
import { constants, Contract, ContractReceipt, Signer, Wallet } from "ethers";
import { Interface } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export { MultiSendDeployment };

export type SupportedChainId =
  keyof typeof GnosisSafeProxyFactoryDeployment.networkAddresses &
    keyof typeof GnosisSafeDeployment.networkAddresses &
    keyof typeof MultiSendDeployment.networkAddresses;

export function isChainIdSupported(
  chainId: string,
): chainId is SupportedChainId {
  return (
    Object.keys(GnosisSafeProxyFactoryDeployment.networkAddresses).includes(
      chainId,
    ) &&
    Object.keys(GnosisSafeDeployment.networkAddresses).includes(chainId) &&
    Object.keys(MultiSendDeployment.networkAddresses).includes(chainId)
  );
}

export async function execSafeTransaction(
  safe: Contract,
  transaction: MetaTransaction,
  signers: (Signer & TypedDataSigner)[],
): Promise<TransactionResponse> {
  const safeTransaction = buildSafeTransaction({
    ...transaction,
    nonce: await safe.nonce(),
  });

  // Hack: looking at the call stack of the imported function
  // `executeTxWithSigners`, it is enough that the signer's type is `Signer &
  // TypedDataSigner`. However, the Safe library function requires the signers'
  // type to be `Wallet`. We coerce the type to be able to use this function
  // with signers without reimplementing all execution and signing routines.
  return await executeTxWithSigners(safe, safeTransaction, signers as Wallet[]);
}

export async function deployWithOwners(
  owners: string[],
  threshold: number,
  deployer: Signer,
  { ethers }: HardhatRuntimeEnvironment,
): Promise<Contract> {
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  if (!isChainIdSupported(chainId)) {
    throw new Error(`Chain id ${chainId} not supported by the Gnosis Safe`);
  }
  const proxyFactory = await ethers.getContractAt(
    GnosisSafeProxyFactory.abi,
    GnosisSafeProxyFactoryDeployment.networkAddresses[chainId],
  );
  const GnosisSafeInterface = new Interface(GnosisSafe.abi);
  const setupOwnersBytecode = GnosisSafeInterface.encodeFunctionData("setup", [
    owners,
    threshold,
    constants.AddressZero,
    "0x",
    constants.AddressZero,
    constants.AddressZero,
    constants.Zero,
    constants.AddressZero,
  ]);
  const deployTransaction: ContractReceipt = await (
    await proxyFactory
      .connect(deployer)
      .createProxy(
        GnosisSafeDeployment.networkAddresses[chainId],
        setupOwnersBytecode,
      )
  ).wait();
  const proxyCreationEvents = deployTransaction.events?.filter(
    (e) => e.event === "ProxyCreation",
  );
  const newSafeAddress: string | undefined =
    proxyCreationEvents?.[0]?.args?.proxy;
  if (
    proxyCreationEvents === undefined ||
    proxyCreationEvents.length !== 1 ||
    newSafeAddress === undefined
  ) {
    throw new Error(
      "Error reading proxy creation event when creating new Safe",
    );
  }
  return new Contract(newSafeAddress, GnosisSafe.abi);
}

export function gnosisSafeAt(address: string): Contract {
  return new Contract(address, GnosisSafe.abi);
}
