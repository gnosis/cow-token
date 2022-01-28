import { HardhatRuntimeEnvironment, HttpNetworkConfig } from "hardhat/types";

// https://hardhat.org/hardhat-network/guides/mainnet-forking.html

// Changes the current testing network to be a fork of mainnet at the latest
// block.
export async function forkMainnet(hre: HardhatRuntimeEnvironment) {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          // Note: the node url should point to an archive node if we want to
          // fork on a specific block (or if a test takes very long to
          // complete). Until this becomes a requirement, we use our default
          // node for mainnet.
          jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/InqJMyBXARYCr8eaH0xuw3se-lVEiV4w",
          blockNumber: 14089300,
        },
      },
    ],
  });
}

export async function stopMainnetFork(hre: HardhatRuntimeEnvironment) {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [],
  });
}
