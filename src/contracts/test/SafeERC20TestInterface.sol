// SPDX-License-Identifier: LGPL-3.0-or-later

pragma solidity ^0.8.10;

import "../vendored/interfaces/IERC20.sol";
import "../vendored/libraries/SafeERC20.sol";

contract SafeERC20TestInterface {
    using SafeERC20 for IERC20;

    function transfer(
        IERC20 token,
        address receiver,
        uint256 amount
    ) public {
        token.safeTransfer(receiver, amount);
    }

    function transferFrom(
        IERC20 token,
        address sender,
        address receiver,
        uint256 amount
    ) public {
        token.safeTransferFrom(sender, receiver, amount);
    }
}
