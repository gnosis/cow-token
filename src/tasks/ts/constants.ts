export const defaultTokens = {
  usdc: {
    "1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "100": "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
    "4": "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",
    "56": "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // Binance Peg Token
  },
  weth: {
    // WETH / wXDAI
    "1": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    "100": "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", // wXDAI
    "4": "0xc778417E063141139Fce010982780140Aa0cD5Ab", // WETH
    "56": "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // Binance Peg Token
  },
  gno: {
    "1": "0x6810e776880C02933D47DB1b9fc05908e5386b96",
    "100": "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb",
    "4": "0xd0Dab4E640D95E9E8A47545598c33e31bDb53C7c",
    "56": "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // Dummy Token Only
  },
} as const;

export const omniBridgeDefaults = {
  "1": {
    ambForeign: "0x4C36d2919e407f0Cc2Ee3c993ccF8ac26d9CE64e",
    multiTokenMediatorForeign: "0x88ad09518695c6c3712AC10a214bE5109a655671",
    multiTokenMediatorHome: "0xf6A78083ca3e2a662D6dd1703c939c8aCE2e268d",
    ambHome: "0x75Df5AF045d91108662D8080fD1FEFAd6aA0bb59",
  },
  "56": {
    ambForeign: "0x05185872898b6f94AA600177EF41B9334B1FA48B",
    multiTokenMediatorForeign: "0xF0b456250DC9990662a6F25808cC74A6d1131Ea9",
    multiTokenMediatorHome: "0x59447362798334d3485c64D1e4870Fde2DDC0d75",
    ambHome: "0x162E898bD0aacB578C8D5F8d6ca588c13d2A383F",
  },
  "100": {
    // pure fake data, only for testing, delete in actual PR.
    ambForeign: "0x05185872898b6f94AA600177EF41B9334B1FA48B",
    multiTokenMediatorForeign: "0x4C36d2919e407f0Cc2Ee3c993ccF8ac26d9CE64e",
    multiTokenMediatorHome: "0x4C36d2919e407f0Cc2Ee3c993ccF8ac26d9CE64e",
    ambHome: "0x162E898bD0aacB578C8D5F8d6ca588c13d2A383F",
  },
} as const;

export const defaultDeploymentArgs = {
  userCount: 1000,
  totalSupply: (10n ** (3n * 4n)).toString(),
  usdcPerCow: "0.15",
  usdcPerGno: "400",
  usdcPerWeth: "4000",
} as const;

export const OUTPUT_FOLDER = "./output/test-deployment";
export const OUTPUT_FOLDER_GC = "./output/test-deployment-gc";
