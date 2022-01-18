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

### Deploying Contracts

The contracts are expected to be deployed by the Gnosis DAO using the Zodiac module.

#### Test deployment

A script that can be used to create a live test deployment of the token contract on the supported networks.
It generates private keys for each user participating in the auctions based on a mnemonic parameter.
Any valid combination of claims can be found among the generated addresses.

The script also deploys all administration Gnosis Safe, for example the DAOs and the funds targets. By default, they will be owned by the deployer address.

Here is an example of how to run a deployment:
```
export INFURA_KEY='insert your Infura key here'
export PK='insert you private key here'
npx hardhat test-deployment --network rinkeby --mnemonic "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
```

The output files can be found in the `output/` folder, which include the addresses of the deployed Gnosis Safes.

More advanced options can be listed by running `npx hardhat test-deployment --help`.

### Verifying contract code

For verifying the deployed contracts on Etherscan:

```sh
export INFURA_KEY='insert your Infura key here'
export ETHERSCAN_API_KEY='insert your Etherscan API key here'
yarn verify $VIRTUAL_TOKEN_ADDRESS --network $NETWORK
```

It is currently only possible to verify the contract code on mainnet or Rinkeby.
