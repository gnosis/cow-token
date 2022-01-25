//! Module implementing a general `CREATE2` vanity address miner.

use ethereum_types::Address;
use rand::{rngs::SmallRng, Rng, SeedableRng as _};
use std::{sync::mpsc, thread};

/// Trait specifying a contract deployment for mining.
pub trait Deployment {
    /// The deployment parameter type.
    type Parameters;

    /// Returns the creation address for the current deployment.
    fn creation_address(&self) -> Address;

    /// Update the deployment in-place given some randomness.
    fn update(&mut self, rng: &mut impl Rng);

    /// Returns the current parameters for the deployment.
    fn parameters(&self) -> Self::Parameters;
}

pub fn search_address<D>(deployment: D, prefix: &[u8]) -> D::Parameters
where
    D: Deployment + Clone + Send + 'static,
    D::Parameters: Send,
{
    let (sender, receiver) = mpsc::channel();
    let _threads = (0..num_cpus::get())
        .map(|_| {
            thread::spawn({
                let mut deployment = deployment.clone();
                let prefix = prefix.to_owned();
                let result = sender.clone();
                move || search_address_worker(&mut deployment, &prefix, result)
            })
        })
        .collect::<Vec<_>>();

    receiver.recv().expect("missing result")
}

fn search_address_worker<D>(deployment: &mut D, prefix: &[u8], result: mpsc::Sender<D::Parameters>)
where
    D: Deployment,
{
    let mut rng = SmallRng::from_entropy();
    while !deployment.creation_address().as_bytes().starts_with(prefix) {
        deployment.update(&mut rng);
    }

    let _ = result.send(deployment.parameters());
}
