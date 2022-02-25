import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20.json";
import { BigNumberish, ethers } from "ethers";

const erc20Interface = new ethers.utils.Interface(IERC20.abi);

interface PrepareBridgingTokensInput {
  token: string;
  receiver: string;
  atoms: BigNumberish;
  ethers: HardhatEthersHelpers;
  multiTokenMediator: string;
}
export async function prepareBridgingTokens({
  token,
  receiver,
  atoms,
  multiTokenMediator: multiTokenMediatorAddress,
  ethers,
}: PrepareBridgingTokensInput): Promise<{
  approve: MetaTransaction;
  relay: MetaTransaction;
}> {
  const multiTokenMediator = await ethers.getContractAt(
    "IOmnibridge",
    multiTokenMediatorAddress,
  );

  const approve = {
    to: token,
    value: "0",
    data: erc20Interface.encodeFunctionData("approve", [
      multiTokenMediator.address,
      atoms,
    ]),
    operation: 0,
  };
  const relay = {
    to: multiTokenMediator.address,
    value: "0",
    data: multiTokenMediator.interface.encodeFunctionData("relayTokens", [
      token,
      receiver,
      atoms,
    ]),
    operation: 0,
  };

  return { approve, relay };
}
