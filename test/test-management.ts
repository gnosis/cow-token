import { MochaOptions } from "mocha";

export enum TestConfigs {
  RunAll,
  Coverage = "coverage",
  IgnoredInCoverage = "ignored in coverage",
  Mainnet = "mainnet",
}

const fixCoverageOptimizerDetails = {
  yul: true,
  yulDetails: {
    stackAllocation: true,
  },
} as const;

export interface TestOptions {
  mocha: MochaOptions;
  initialBaseFeePerGas: number | undefined;
  optimizerDetails: typeof fixCoverageOptimizerDetails | undefined;
}

let currentConfig = TestConfigs.RunAll;
const regexpIgnoredOnCoverage = /\[skip-in-coverage\]/;

export function setupTestConfigs(config: string | undefined): TestOptions {
  const mocha: MochaOptions = {};
  let optimizerDetails: typeof fixCoverageOptimizerDetails | undefined =
    undefined;
  let initialBaseFeePerGas: number | undefined = undefined;
  switch (config) {
    case undefined:
      currentConfig = TestConfigs.RunAll;
      break;
    case "coverage":
      currentConfig = TestConfigs.Coverage;
      mocha.grep = /^(?!Mainnet)/;
      // Note: unit is Wei, not GWei. This is a workaround to make the coverage
      // tool work with the London hardfork.
      initialBaseFeePerGas = 1;
      // Fixes stack too deep error when compiling contracts in coverage.
      // https://github.com/ethereum/solidity/issues/10354
      optimizerDetails = fixCoverageOptimizerDetails;
      break;
    case "ignored in coverage":
      currentConfig = TestConfigs.IgnoredInCoverage;
      mocha.grep = regexpIgnoredOnCoverage;
      break;
    case "mainnet":
      currentConfig = TestConfigs.Mainnet;
      mocha.grep = /^Mainnet/;
      break;
    default:
      throw new Error(`Invalid test config string ${config}`);
  }
  return { mocha, initialBaseFeePerGas, optimizerDetails };
}

// Note: to use this function, Mocha's "this context" must be available to the
// test function. This means that the test should be called like this:
// >  it("description", async function () {...
// instead of
// >  it("description", async () => {...
export function skipOnCoverage(this: Mocha.Context) {
  if (currentConfig === TestConfigs.Coverage) {
    if (!regexpIgnoredOnCoverage.test(this.test?.fullTitle() ?? "")) {
      // Unfortunately, the test description must contain a specific string to
      // be run in TestConfigs.IgnoredInCoverage. If you see this error, add
      // to the test description a substring to match regexpIgnoredOnCoverage.
      throw new Error(
        "Test is ignored in coverage but does not have the flag [skip-in-coverage] in the description",
      );
    }
    this.skip();
  }
}
