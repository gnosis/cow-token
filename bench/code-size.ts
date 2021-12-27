import { artifacts } from "hardhat";

async function main() {
  const contracts = ["CowSwapToken", "CowSwapVirtualToken"];
  const maxLenght = Math.max(...contracts.map((name) => name.length));

  console.log(`${"Contract".padEnd(maxLenght, " ")} | Deployed | Deployment`);
  for (const contract of contracts) {
    const buildOutput = await artifacts.readArtifact(contract);
    console.log(
      `${contract.padEnd(
        maxLenght,
        " ",
      )} | ${buildOutput.deployedBytecode.length
        .toString()
        .padStart(8, " ")} | ${buildOutput.bytecode.length
        .toString()
        .padStart(10, " ")}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
