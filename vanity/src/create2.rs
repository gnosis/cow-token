//! Module implementing `CREATE2` deterministic address computation logic.

use ethereum_types::{Address, H256};
use tiny_keccak::{Hasher as _, Keccak};

/// `CREATE2` parameters.
#[derive(Clone, Debug)]
pub struct Create2([u8; 85]);

impl Create2 {
    /// Creates a new instance with the specified parameters.
    pub fn new(factory: Address, salt: H256, init_code: H256) -> Self {
        let mut create2 = Self([0xff_u8; 85]);
        create2.factory_mut().copy_from_slice(factory.as_bytes());
        create2.salt_mut().copy_from_slice(salt.as_bytes());
        create2
            .init_code_mut()
            .copy_from_slice(init_code.as_bytes());

        create2
    }

    /// Returns the slice representing the factory.
    pub fn factory_mut(&mut self) -> &mut [u8; 20] {
        unsafe { &mut *self.0.get_unchecked_mut(1..21).as_mut_ptr().cast() }
    }

    /// Returns the slice representing the factory.
    pub fn salt_mut(&mut self) -> &mut [u8; 32] {
        unsafe { &mut *self.0.get_unchecked_mut(21..53).as_mut_ptr().cast() }
    }

    /// Returns the current value of the salt.
    pub fn salt(&self) -> H256 {
        H256::from_slice(&self.0[21..53])
    }

    /// Returns the slice representing the factory.
    pub fn init_code_mut(&mut self) -> &mut [u8; 32] {
        unsafe { &mut *self.0.get_unchecked_mut(53..85).as_mut_ptr().cast() }
    }

    /// Returns the deterministic address for the `CREATE2` parameters.
    pub fn creation_address(&self) -> Address {
        let mut buffer = [0_u8; 32];
        let mut hasher = Keccak::v256();
        hasher.update(&self.0);
        hasher.finalize(&mut buffer);
        ethereum_types::H160(unsafe { *buffer.get_unchecked(12..32).as_ptr().cast() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_deterministic_address() {
        assert_eq!(
            Create2::new(
                address!("5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"),
                digest!("0815f4f41ecb52c539a2caa2ccf468f9bc76a0f2651129ff468ac2a33cf75983"),
                digest!("96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f")
            )
            .creation_address(),
            address!("3e8468f66d30fc99f745481d4b383f89861702c6"),
        );
    }
}
