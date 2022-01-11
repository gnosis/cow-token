// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../CowProtocolToken.sol";

contract CowProtocolTokenTestInterface is CowProtocolToken {
    string private constant ERC20_SYMBOL = "COW";
    string private constant ERC20_NAME = "CoW Protocol Token";

    constructor(address cowDao, uint256 totalSupply)
        CowProtocolToken(cowDao, totalSupply)
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
