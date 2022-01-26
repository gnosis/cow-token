import { utils } from "ethers";

export const defaultTokens = {
  usdc: {
    "1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "100": "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
    "4": "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",
  },
  weth: {
    // WETH / wXDAI
    "1": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    "100": "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", // wXDAI
    "4": "0xc778417E063141139Fce010982780140Aa0cD5Ab", // WETH
  },
  gno: {
    "1": "0x6810e776880C02933D47DB1b9fc05908e5386b96",
    "100": "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb",
    "4": "0xd0Dab4E640D95E9E8A47545598c33e31bDb53C7c",
  },
} as const;

// the amount of tokens to relay to the omni bridge at deployment time
export const amountToRelay = utils.parseEther("1");