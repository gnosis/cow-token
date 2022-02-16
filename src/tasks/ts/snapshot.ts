import { Contract } from "@ethersproject/contracts";
import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { providers } from "ethers";

// Shortened ABI for the smart contract that executes Snapshot transactions. See:
// https://github.com/gnosis/zodiac-module-reality/blob/64530f2b6577f756328e0c898d33534e0bcc6c06/contracts/RealityModule.sol
const realityModuleAbi = [
  "function getTransactionHash(address,uint256,bytes memory,uint8,uint256) public view returns (bytes32)",
];

export class RealityModule {
  instance: Contract;

  constructor(address: string, provider: providers.Provider) {
    this.instance = new Contract(address, realityModuleAbi, provider);
  }

  async getTransactionHash(
    tx: MetaTransaction,
    index: number,
  ): Promise<string> {
    return this.instance.getTransactionHash(
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      index,
    );
  }
}
