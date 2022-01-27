//! COW token deployment implementation.

use crate::{
    artifact::Artifact,
    create2::Create2,
    miner::Deployment,
    safe::Safe,
    settings::{SafeParameters, TokenParameters},
};
use ethereum_types::{Address, H256, U256};
use once_cell::sync::Lazy;
use tiny_keccak::{Hasher as _, Keccak};

const DEPLOYER: Address = address!("4e59b44847b379578588920ca78fbf26c0b4956c");
const TOTAL_SUPPLY: u128 = 10_u128.pow(27);
static ARTIFACT: Lazy<Artifact> = Lazy::new(|| {
    serde_json::from_str(include_str!(
        "../../build/artifacts/src/contracts/CowProtocolToken.sol/CowProtocolToken.json"
    ))
    .expect("invalid artifact JSON")
});

/// COW token deployment.
#[derive(Clone)]
pub struct CowToken {
    create2: Create2,
}

impl CowToken {
    /// Creates a new COW token from deployment parameters.
    pub fn new(
        gnosis_dao: Address,
        cow_dao_parameters: SafeParameters,
        parameters: TokenParameters,
    ) -> Self {
        let cow_dao = Safe::new(cow_dao_parameters).creation_address();
        Self::with_dao(gnosis_dao, cow_dao, parameters)
    }

    /// Creates a new COW token from the specified DAO safe address and
    /// parameters.
    fn with_dao(gnosis_dao: Address, cow_dao: Address, parameters: TokenParameters) -> CowToken {
        let create2 = Create2::new(
            DEPLOYER,
            parameters.salt,
            init_code(gnosis_dao, cow_dao, TOTAL_SUPPLY.into()),
        );

        Self { create2 }
    }

    /// Returns the current salt value for the token deployment.
    pub fn salt(&self) -> H256 {
        self.create2.salt()
    }
}

impl Deployment for CowToken {
    fn creation_address(&self) -> Address {
        self.create2.creation_address()
    }

    fn update(&mut self, rng: &mut impl rand::Rng) {
        rng.fill(self.create2.salt_mut());
    }
}

/// Computes the init code hash for the specified deployment parameters.
fn init_code(initial_token_holder: Address, dao: Address, total_supply: U256) -> H256 {
    // poor man's ABI encode.
    fn num(a: impl Into<U256>) -> [u8; 32] {
        let mut b = [0_u8; 32];
        a.into().to_big_endian(&mut b);
        b
    }
    fn addr(a: Address) -> [u8; 32] {
        let mut b = [0_u8; 32];
        b[12..].copy_from_slice(&a.0);
        b
    }

    let mut hasher = Keccak::v256();
    hasher.update(&ARTIFACT.bytecode);
    hasher.update(&addr(initial_token_holder));
    hasher.update(&addr(dao));
    hasher.update(&num(total_supply));

    let mut buffer = [0_u8; 32];
    hasher.finalize(&mut buffer);
    H256(buffer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_code_matches_test() {
        // Taken from running the `deployment:performed from a Gnosis Safe` test
        // and printing the result of `ethers.utils.keccak256(bytecode)` in
        // `getDeterministicDeploymentTransaction` method.
        let init_code = init_code(
            address!("0da0000042424242424242424242424242424242"), // initial holder
            address!("ca1f000042424242424242424242424242424242"), // dao
            1337.into(),
        );

        assert_eq!(
            init_code,
            digest!("0ac1236438e957960ed4902bb4715f09133ac313d1a94e3a716f69d2509077ad"),
        );
    }

    #[test]
    fn computes_address() {
        // Taken from calling `getDeterministicDeploymentTransaction` with the
        // test parameters used here.
        let address = CowToken::with_dao(
            address!("9da0424242424242424242424242424242424242"),
            address!("cda0424242424242424242424242424242424242"),
            TokenParameters {
                salt: digest!("5a175a175a175a175a175a175a175a175a175a175a175a175a175a175a175a17"),
            },
        )
        .create2
        .creation_address();

        assert_eq!(
            address,
            address!("8229E361AFf3d0F27eDD63D891f17e59338cA4Bc"),
        );
    }
}
