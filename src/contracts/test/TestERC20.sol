// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract TestERC20 is ERC20PresetMinterPauser {
    uint8 private _decimals;

    constructor(string memory symbol, uint8 erc20Decimals)
        ERC20PresetMinterPauser(symbol, symbol) // solhint-disable-next-line no-empty-blocks
    {
        _decimals = erc20Decimals;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
