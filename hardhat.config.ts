import "@nomiclabs/hardhat-waffle";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomiclabs/hardhat-etherscan";

import dotenv from "dotenv";
import { utils } from "ethers";
import type { HttpNetworkUserConfig } from "hardhat/types";
import yargs from "yargs";

import { setupTasks } from "./src/tasks";
import { setupTestConfigs } from "./test/test-management";

const argv = yargs
  .option("network", {
    type: "string",
    default: "hardhat",
  })
  .help(false)
  .version(false)
  .parseSync();

// Load environment variables.
dotenv.config();
const {
  INFURA_KEY,
  MNEMONIC,
  PK,
  REPORT_GAS,
  MOCHA_CONF,
  NODE_URL,
  ETHERSCAN_API_KEY,
  GAS_PRICE_GWEI,
} = process.env;

const DEFAULT_MNEMONIC =
  "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

if (
  ["rinkeby", "mainnet"].includes(argv.network) &&
  NODE_URL === undefined &&
  INFURA_KEY === undefined
) {
  throw new Error(
    `Could not find Infura key in env, unable to connect to network ${argv.network}`,
  );
}

const sharedNetworkConfig: HttpNetworkUserConfig = {};
if (NODE_URL) {
  sharedNetworkConfig.url = NODE_URL;
}
if (PK) {
  sharedNetworkConfig.accounts = [PK];
} else {
  sharedNetworkConfig.accounts = {
    mnemonic: MNEMONIC || DEFAULT_MNEMONIC,
  };
}
if (GAS_PRICE_GWEI) {
  sharedNetworkConfig.gasPrice = utils
    .parseUnits(GAS_PRICE_GWEI, "gwei")
    .toNumber();
}

const { mocha, initialBaseFeePerGas, optimizerDetails } =
  setupTestConfigs(MOCHA_CONF);

setupTasks();

export default {
  mocha,
  paths: {
    artifacts: "build/artifacts",
    cache: "build/cache",
    sources: "src/contracts",
  },
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000000,
            details: optimizerDetails,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      blockGasLimit: 12.5e6,
      initialBaseFeePerGas,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      ...sharedNetworkConfig,
      chainId: 1,
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_KEY}`,
      ...sharedNetworkConfig,
      chainId: 4,
    },
    gnosischain: {
      ...sharedNetworkConfig,
      url: "https://rpc.gnosischain.com",
      chainId: 100,
    },
  },
  gasReporter: {
    enabled: REPORT_GAS ? true : false,
    currency: "USD",
    gasPrice: 100,
  },
  etherscan: {
    apiKey: {
      xdai: "any api key is good currently",
      mainnet: ETHERSCAN_API_KEY,
      rinkeby: ETHERSCAN_API_KEY,
    },
  },
};
