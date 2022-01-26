//! Cow token deployment settings types.

use ethereum_types::{Address, H256, U256};
use serde::Deserialize;
use std::{fs::File, io, path::Path};

/// Cow token deployment settings.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub gnosis_dao: Address,
    pub cow_dao: SafeParameters,
    pub team_controller: SafeParameters,
    pub cow_token: TokenParameters,
}

impl Settings {
    /// Loads a deployment settings file.
    pub fn from_file(path: &Path) -> Result<Self, io::Error> {
        let file = File::open(path)?;
        let result = serde_json::from_reader(file)?;
        Ok(result)
    }
}

/// Safe deployment settings.
#[derive(Debug, Deserialize)]
pub struct SafeParameters {
    pub threshold: usize,
    pub owners: Vec<Address>,
    #[serde(with = "permissive_u256", default)]
    pub nonce: U256,
}

/// Token deployment settings.
#[derive(Debug, Deserialize)]
pub struct TokenParameters {
    #[serde(default)]
    pub salt: H256,
}

mod permissive_u256 {
    use ethereum_types::U256;
    use serde::de::{self, Deserialize as _, Deserializer};
    use std::borrow::Cow;

    pub fn deserialize<'de, D>(deserializer: D) -> Result<U256, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = Cow::<str>::deserialize(deserializer)?;
        let u = match s.strip_prefix("0x") {
            Some(s) => U256::from_str_radix(s, 16),
            None => U256::from_str_radix(&s, 10),
        };
        u.map_err(de::Error::custom)
    }
}
