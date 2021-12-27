// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../CowSwapToken.sol";

contract CowSwapTokenTestInterface is CowSwapToken {
    string private constant ERC20_SYMBOL = "COW";
    string private constant ERC20_NAME = "CowSwap Token";

    constructor(address cowDao, uint256 totalSupply)
        CowSwapToken(cowDao, totalSupply)
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
