//! Hardhat artifact parsing.

use serde::Deserialize;

/// A hardhat artifact.
#[derive(Debug, Deserialize)]
pub struct Artifact {
    #[serde(with = "hex")]
    pub bytecode: Vec<u8>,
}

mod hex {
    use serde::de::{self, Deserialize as _, Deserializer};
    use std::borrow::Cow;

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = Cow::<str>::deserialize(deserializer)?;
        let h = s
            .strip_prefix("0x")
            .ok_or_else(|| de::Error::custom("missing 0x prefix"))?;
        hex::decode(h).map_err(de::Error::custom)
    }
}
