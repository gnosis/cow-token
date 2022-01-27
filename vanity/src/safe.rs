//! Safe deployment implementation.

use crate::{create2::Create2, miner::Deployment, settings::SafeParameters};
use ethereum_types::{Address, H256, U256};
use hex_literal::hex;
use rand::Rng;
use tiny_keccak::{Hasher as _, Keccak};

const PROXY_FACTORY: Address = address!("a6B71E26C5e0845f74c812102Ca7114b6a896AB2");
const PROXY_INIT_CODE: H256 =
    digest!("56e3081a3d1bb38ed4eed1a39f7729c3cc77c7825794c15bbf326f3047fd779c");
const FALLBACK_HANDLER: Address = address!("f48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4");

/// Safe deployment.
#[derive(Clone)]
pub struct Safe {
    owners: Vec<Address>,
    threshold: usize,
    salt: [u8; 64],
    create2: Create2,
}

impl Safe {
    /// Creates a new safe from deployment parameters.
    pub fn new(parameters: SafeParameters) -> Self {
        let mut salt = [0_u8; 64];
        let mut hasher = Keccak::v256();
        hasher.update(&initializer(&parameters.owners, parameters.threshold));
        hasher.finalize(&mut salt[0..32]);
        parameters.nonce.to_big_endian(&mut salt[32..64]);

        let mut create2 = Create2::new(PROXY_FACTORY, Default::default(), PROXY_INIT_CODE);
        let mut hasher = Keccak::v256();
        hasher.update(&salt);
        hasher.finalize(create2.salt_mut());

        Self {
            owners: parameters.owners,
            threshold: parameters.threshold,
            salt,
            create2,
        }
    }

    fn salt_nonce_bytes_mut(&mut self) -> &mut [u8] {
        unsafe { self.salt.get_unchecked_mut(32..64) }
    }

    fn salt_nonce(&self) -> U256 {
        U256::from_big_endian(&self.salt[32..64])
    }
}

impl Deployment for Safe {
    type Parameters = SafeParameters;

    fn creation_address(&self) -> Address {
        self.create2.creation_address()
    }

    fn update(&mut self, rng: &mut impl Rng) {
        rng.fill(self.salt_nonce_bytes_mut());
        let mut hasher = Keccak::v256();
        hasher.update(&self.salt);
        hasher.finalize(self.create2.salt_mut());
    }

    fn parameters(&self) -> Self::Parameters {
        Self::Parameters {
            owners: self.owners.clone(),
            threshold: self.threshold,
            nonce: self.salt_nonce(),
        }
    }
}

/// Computes the initializer calldata for the specified Safe parameters.
fn initializer(owners: &[Address], threshold: usize) -> Vec<u8> {
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

    let mut buffer = Vec::new();

    buffer.extend_from_slice(&hex!("b63e800d"));
    buffer.extend_from_slice(&num(0x100)); // owners.offset
    buffer.extend_from_slice(&num(threshold));
    buffer.extend_from_slice(&addr(Address::zero())); // to
    buffer.extend_from_slice(&num(0x120 + 0x20 * owners.len())); // data.offset
    buffer.extend_from_slice(&addr(FALLBACK_HANDLER));
    buffer.extend_from_slice(&addr(Address::zero())); // paymentToken
    buffer.extend_from_slice(&num(0)); // payment
    buffer.extend_from_slice(&addr(Address::zero())); // paymentReceiver
    buffer.extend_from_slice(&num(owners.len())); // owners.length
    for owner in owners {
        buffer.extend_from_slice(&addr(*owner)); // owners.length
    }
    buffer.extend_from_slice(&num(0)); // data.length

    buffer
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initializer_bytes() {
        assert_eq!(
            &initializer(
                &[
                    address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
                    address!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
                    address!("cccccccccccccccccccccccccccccccccccccccc"),
                ],
                2,
            ),
            &hex!(
                "b63e800d
                 0000000000000000000000000000000000000000000000000000000000000100
                 0000000000000000000000000000000000000000000000000000000000000002
                 0000000000000000000000000000000000000000000000000000000000000000
                 0000000000000000000000000000000000000000000000000000000000000180
                 000000000000000000000000f48f2b2d2a534e402487b3ee7c18c33aec0fe5e4
                 0000000000000000000000000000000000000000000000000000000000000000
                 0000000000000000000000000000000000000000000000000000000000000000
                 0000000000000000000000000000000000000000000000000000000000000000
                 0000000000000000000000000000000000000000000000000000000000000003
                 000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
                 000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
                 000000000000000000000000cccccccccccccccccccccccccccccccccccccccc
                 0000000000000000000000000000000000000000000000000000000000000000"
            ),
        );
    }

    #[test]
    fn compute_address() {
        let safe = Safe::new(SafeParameters {
            owners: vec![address!("85108e6bEE0E6E4d317b72751365d5A5D2Ee66a5")],
            threshold: 1,
            nonce: 0x17e63b10d14_u64.into(),
        });

        let address = safe.creation_address();
        assert_eq!(
            address,
            address!("8c166d8d0d6d884e433196e06d44cca2be9a21c9")
        );

        // <https://etherscan.io/tx/0x22b25b3937c680eacc31f876d101bba8feb549e087a36aaa097ac133d46369d0>
        let safe = Safe::new(SafeParameters {
            owners: vec![
                address!("234ec257298586ad7242c1a74f57879c041140b7"),
                address!("c409869444e8f42f3bca2cfd7e94b98f316de37b"),
                address!("ce280ea3648d4027275d77abdfa7c704fe5199c5"),
            ],
            threshold: 2,
            nonce: 1643091116067_u64.into(),
        });

        let address = safe.creation_address();
        assert_eq!(
            address,
            address!("5bBB3663008714348e26487E5c11211C2585b8eC")
        );
    }
}
