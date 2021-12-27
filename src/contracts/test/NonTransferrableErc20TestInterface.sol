// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../mixins/NonTransferrableErc20.sol";

contract NonTransferrableErc20TestInterface is NonTransferrableErc20 {
    constructor(string memory name, string memory symbol)
        NonTransferrableErc20(name, symbol)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function balanceOf(address) public pure returns (uint256) {
        revert("Not needed in test");
    }

    function totalSupply() public pure returns (uint256) {
        revert("Not needed in test");
    }
}
