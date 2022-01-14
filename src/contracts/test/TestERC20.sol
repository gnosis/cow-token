// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract TestERC20 is ERC20PresetMinterPauser {
    constructor(string memory symbol)
        ERC20PresetMinterPauser(symbol, symbol) // solhint-disable-next-line no-empty-blocks
    {}
}
