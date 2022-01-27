# CoW Protocol Token

This repository contains the Solidity smart contract code for the CoW Protocol/CowSwap token.

## Overview

This repo contains all code related to the deployment of the COW token contract and the tools that manage how the token will be distributed.

Two contracts will be deployed onchain: the CoW Protocol token contract (COW) and a "virtual" CoW Protocol token (vCOW).
The COW token is a standard ERC20 token that can optionally be minted by the CowDao, up to 3% of the total supply each year.
The virtual token manages how the real token is distributed and cannot be transferred.

In the deployment transaction, all existing COW tokens are minted and sent to the CoW Protocol DAO.
Shares of virtual tokens will be assigned to the users in advance based on a Merkle tree that is determined at deployment time.
Some claims will be paid (with different currencies), some will be vesting in time, and some will be cancellable.
All claims have a deadline, the latest is six weeks after deployment; no claim can be redeemed after its deadline has passed.
Claims can be exercised by anyone, but only the claim owner can partially redeem them.

After all shares of virtual token have been distributed, they may be made convertible to COW tokens by the CowDao.
To do this, the DAO would have to send to the virtual token contract the exact amount of COW tokens needed to cover all exercised virtual token claims.
Then, the claim owner will be able to swap virtual tokens to real tokens, effectively converting virtual tokens to real tokens one to one.

## Getting Started

### Building the Project

```sh
yarn
yarn build
```

### Running Tests

```sh
yarn test
```

#### Test coverage

The contracts code in this repo is fully covered by unit tests.
Test coverage can be checked by running the following command:

```sh
yarn coverage
```

A summary of coverage results are printed out to console. More detailed information is presented in the generated file `coverage/index.html`.

Contracts that are either vendored from other repositories or only used in tests are not included in coverage.

#### Gas Reporter

Gas consumption can be estimated from the tests. Setting the `REPORT_GAS` flag when running tests shows details on the gas consumption of each method.

```sh
REPORT_GAS=1 yarn test
```

#### Contract Code Size

Contract code size can be benched by running:

```sh
yarn bench:code-size
```

### Deploying Contracts: Proposal-Transactions Creation

The contracts are deployed by the Gnosis DAO using the Zodiac module. 
In the following, it is show on to build the tx proposed to the Gnosis DAO with a script.

The deployment happens on two chains: Ethereum-Chain and Gnosis-Chain. 
At first, a deployment helper contract - called BridgedTokenDeployer - is deployed on Gnosis-Chain. 
This BridgedTokenDeployer contains the information to run the CowProtocolVirtualToken deployment on Gnosis-Chain. 
This contract will later be triggered from the Ethereum-Chain via the Omni-Bridge. 
The main part of the deployment is done on Ethereum-Chain. 
The GnosisDAO will initiate all necessary transactions to create the different safes, create the CowProtocolToken and CowProtocolVirtualToken. 
Furthermore, the GnosisDAO will bridge one CowProtocolToken to the Omni-Bridge in order to trigger the bridge to deploy the bridged CowProtocolToken also on Gnosis-Chain. 
Last, but not least, the GnosisDao will deploy over the bridge also a new Community Safe on Gnosis Chain and trigger the CowProtocolVirtualToken deployment on the BridgedTokenDeployer over the Omni-Bridge.

The deployment has the following inputs:
- .env file for Ethereum-Chain. See [example](.env.sample)
- mainnet/claims.csv file with the airdrop information for mainnet. See [example](#example-csv-file-with-claims)
- .env file for gnosis chain. See [example](.env.sample)
- gnosischain/claims.csv file with the airdrop information for Gnosis-Chain
- setting.json describing the most important parameters. See [example](example/settings.json)

#### 1st step: Deployment on Gnosis-Chain
```
yarn build
source env/gnosischain/.env
npx hardhat deployment-bridged-token-deployer --settings ./settings.json --claims ./gnosischain/claims.csv --network gnosischain
```

The output files are in the `output/deployment-gc` folder, which include:
2. `addresses.json`, a list with on entry: the newly deployed BridgedTokenDeployer.
3. `claims.json`, a list of all the claims of all user. It contains all information needed by a user to perform a claim onchain. 
4. `chunks` and `mapping.json`, which contain a reorganized version of the same claims that are available in `claims.json`. This format is easier to handle by a web frontend. The format is very similar to the one used in the Uniswap airdrop.

Run the verifier to check that your deployment was successful:
```
npx hardhat verify-contract-code --bridged-token-deployer  "<address from of addresses.json>" --network gnosischain  
```
and copy <address from of addresses.json> into the settings.json for the entry `bridgedTokenDeployer` for the next step.


#### 2nd step: Mainnet proposal creation
```
source env/mainnet/.env
npx hardhat deployment --claims ./mainnet/claims.csv --settings ./settings.json --network mainnet 
```

This script is deterministic and can be used to verify the transactions proposed to the Gnosis DAO.

The output files are in the `output/deployment` folder, which include:
1. `steps.json`, a list of transactions to be executed from the Gnosis DAO in the proposal.
2. `addresses.json`, a list of (deterministically generated) contract addresses that will result from executing the deployment onchain.
3. `claims.json`, a list of all the claims of all user. It contains all information needed by a user to perform a claim onchain. 
4. `chunks` and `mapping.json`, which contain a reorganized version of the same claims that are available in `claims.json`. This format is easier to handle by a web frontend. The format is very similar to the one used in the Uniswap airdrop.

#### Test deployment

A script that can be used to create a live test deployment of the token contract on the supported networks.
It generates claims based on an input CSV file. See the [example section](#example-csv-file-with-claims) for how to generate a valid CSV file.

The script also deploys all administration Gnosis Safe, for example the DAOs and the funds targets. By default, they will be owned by the deployer address.

Here is an example of how to run a deployment:
```
export INFURA_KEY='insert your Infura key here'
export PK='insert you private key here'
npx hardhat test-deployment --network rinkeby /path/to/claims.csv
```

The output files can be found in the `output/test-deployment` folder, which include the addresses of the deployed Gnosis Safes.

More advanced options can be listed by running `npx hardhat test-deployment --help`.

#### Example CSV file with claims

A script is available to generate a CSV file containing pseudorandom claims for testing.
It generates private keys for each user based on a mnemonic parameter. To each of these users will be assigned different claim combinations.
Any valid combination of claim types can be found among the generated addresses.

Example usage:
```
npx hardhat test-claims --user-count 10000 --mnemonic "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
```

The computed private keys and the CSV file containing all the claims are stored in the folder `output/test-claims`.

### Verifying contract code

For verifying the deployed contracts on Etherscan:

```sh
export INFURA_KEY='insert your Infura key here'
export ETHERSCAN_API_KEY='insert your Etherscan API key here'
yarn verify $VIRTUAL_TOKEN_ADDRESS --network $NETWORK
```

It is currently only possible to verify the contract code on mainnet or Rinkeby.
