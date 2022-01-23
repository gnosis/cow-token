import type { TransactionResponse } from "@ethersproject/abstract-provider";
import { MetaTransaction, encodeMultiSend } from "@gnosis.pm/safe-contracts";
import MultiSend from "@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json";
import GnosisSafeProxyFactory from "@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json";
import GnosisSafe from "@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";
import CreateCall from "@gnosis.pm/safe-contracts/build/artifacts/contracts/libraries/CreateCall.sol/CreateCall.json";
import {
  BigNumber,
  BigNumberish,
  BytesLike,
  constants,
  Contract,
  utils,
} from "ethers";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

export enum SafeOperation {
  Call = 0,
  DelegateCall = 1,
}

export interface SafeDeploymentAddresses {
  singleton: string;
  factory: string;
  fallbackHandler: string;
}

const gnosisSafeIface = new utils.Interface(GnosisSafe.abi);
const proxyFactoryIface = new utils.Interface(GnosisSafeProxyFactory.abi);
const createCallIface = new utils.Interface(CreateCall.abi);

export function safeSetupData(
  owners: string[],
  threshold: number,
  fallbackHandler?: string,
): string {
  return gnosisSafeIface.encodeFunctionData("setup", [
    owners,
    threshold,
    constants.AddressZero,
    "0x",
    fallbackHandler ?? constants.AddressZero,
    constants.AddressZero,
    constants.Zero,
    constants.AddressZero,
  ]);
}

export async function prepareDeterministicSafeWithOwners(
  owners: string[],
  threshold: number,
  {
    singleton,
    factory,
    fallbackHandler,
  }: Pick<SafeDeploymentAddresses, "singleton" | "factory"> &
    Partial<SafeDeploymentAddresses>,
  nonce: BigNumberish,
  ethers: HardhatEthersHelpers,
): Promise<{ to: string; data: string; address: string }> {
  const setupOwnersBytecode = safeSetupData(owners, threshold, fallbackHandler);
  const proxyFactory = new Contract(
    factory,
    GnosisSafeProxyFactory.abi,
  ).connect(ethers.provider);
  const createProxyInput = [
    singleton,
    setupOwnersBytecode,
    BigNumber.from(nonce),
  ];
  const data: string = proxyFactoryIface.encodeFunctionData(
    "createProxyWithNonce",
    createProxyInput,
  );
  const address = await proxyFactory.callStatic.createProxyWithNonce(
    ...createProxyInput,
  );
  return { to: proxyFactory.address, data, address };
}

export function prepareSafeWithOwners(
  owners: string[],
  threshold: number,
  {
    singleton,
    factory,
    fallbackHandler,
  }: Pick<SafeDeploymentAddresses, "singleton" | "factory"> &
    Partial<SafeDeploymentAddresses>,
): { to: string; data: string } {
  const setupOwnersBytecode = safeSetupData(owners, threshold, fallbackHandler);
  const data: string = proxyFactoryIface.encodeFunctionData("createProxy", [
    singleton,
    setupOwnersBytecode,
  ]);
  return { to: factory, data };
}

export async function createdProxies(
  response: TransactionResponse,
  proxyFactoryAddress: string,
): Promise<string[]> {
  const receipt = await response.wait();
  const creationEvents = receipt.logs
    .filter(({ address }) => address === proxyFactoryAddress)
    .map((log) => proxyFactoryIface.parseLog(log))
    .filter(({ name }) => name === "ProxyCreation");
  return creationEvents.map(({ args }) => args.proxy);
}

export async function getFallbackHandler(
  safe: string,
  ethers: HardhatEthersHelpers,
): Promise<string> {
  const FALLBACK_HANDLER_STORAGE_SLOT =
    "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";
  const storage = await ethers.provider.getStorageAt(
    safe,
    FALLBACK_HANDLER_STORAGE_SLOT,
  );
  return utils.getAddress(utils.hexlify(utils.arrayify(storage).slice(12, 32)));
}

export function multisend(
  transactions: MetaTransaction[],
  multisendAddress: string,
): MetaTransaction {
  const multisend = new Contract(multisendAddress, MultiSend.abi);
  const data = multisend.interface.encodeFunctionData("multiSend", [
    encodeMultiSend(transactions),
  ]);
  return {
    to: multisend.address,
    value: 0,
    operation: SafeOperation.DelegateCall,
    data,
  };
}

export function createTransaction(
  deploymentData: BytesLike,
  createCallAddress: string,
) {
  const createCall = new Contract(createCallAddress, CreateCall.abi);
  const value = constants.Zero;
  const data = createCall.interface.encodeFunctionData("performCreate", [
    value,
    deploymentData,
  ]);
  return {
    to: createCall.address,
    value,
    operation: SafeOperation.Call,
    data,
  };
}

export async function contractsCreatedWithCreateCall(
  response: TransactionResponse,
  createCallAddress: string,
): Promise<string[]> {
  const receipt = await response.wait();
  const creationEvents = receipt.logs
    .filter(({ address }) => address === createCallAddress)
    .map((log) => createCallIface.parseLog(log))
    .filter(({ name }) => name === "ContractCreation");
  return creationEvents.map(({ args }) => args.newContract);
}
