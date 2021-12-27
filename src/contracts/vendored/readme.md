### Vendored smart contracts

The smart contracts in this folder are copied with minimal or no changes from existing repositories and have been included in this repo to make our contracts self contained.

The following code can be run in Bash to verify that no unexpected changes appear.

```sh
for contract in $(find src/contracts/vendored -name '*.sol' -type f); do
  vendored_url="$(grep --only-matching '<https://.*>' "$contract" | head --lines=1)"
  echo "Diff for $contract, vendored from ${vendored_url:1:-1}"
  diff <(curl --silent "${vendored_url:1:-1}" | npx prettier --parser solidity-parse) "$contract"
done
```
