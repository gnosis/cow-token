macro_rules! address {
    ($s:literal) => {{
        ::ethereum_types::H160(::hex_literal::hex!($s))
    }};
}

macro_rules! digest {
    ($s:literal) => {{
        ::ethereum_types::H256(::hex_literal::hex!($s))
    }};
}
