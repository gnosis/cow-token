#[macro_use]
mod macros;

mod artifact;
mod create2;
mod miner;
mod safe;
mod settings;
mod token;

use self::{miner::Deployment as _, safe::Safe, token::CowToken};
use clap::{ArgEnum, Parser};
use settings::Settings;
use std::{path::PathBuf, process, str::FromStr};

/// Generate vanity addresses for CowSwap deployment.
#[derive(Debug, Parser)]
struct Args {
    /// Path to the deployment settings file.
    #[clap(short, long)]
    settings: PathBuf,

    /// Prefix to search for
    #[clap(short, long)]
    prefix: Hex,

    /// Contract to mine address for.
    #[clap(short, long, arg_enum)]
    contract: Contract,
}

#[derive(Debug)]
struct Hex(Vec<u8>);

impl FromStr for Hex {
    type Err = hex::FromHexError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        hex::decode(s.strip_prefix("0x").unwrap_or(s)).map(Hex)
    }
}

#[derive(Clone, Copy, Debug, ArgEnum)]
enum Contract {
    Dao,
    TeamController,
    Token,
}

fn main() {
    let args = Args::parse();
    let settings = match Settings::from_file(&args.settings) {
        Ok(settings) => settings,
        Err(err) => {
            eprintln!("ERROR: failed to read settings file: {err}");
            process::exit(1);
        }
    };

    match args.contract {
        Contract::Dao => {
            let safe = miner::search_address(Safe::new(settings.cow_dao), &args.prefix.0);
            println!("address:    {:?}", safe.creation_address());
            println!("salt nonce: {}", safe.salt_nonce());
        }
        Contract::TeamController => {
            let safe = miner::search_address(Safe::new(settings.team_controller), &args.prefix.0);
            println!("address:    {:?}", safe.creation_address());
            println!("salt nonce: {}", safe.salt_nonce());
        }
        Contract::Token => {
            let token = miner::search_address(
                CowToken::new(settings.gnosis_dao, settings.cow_dao, settings.cow_token),
                &args.prefix.0,
            );
            println!("address: {:?}", token.creation_address());
            println!("salt:    {}", token.salt());
        }
    }
}
