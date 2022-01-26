// SPDX-License-Identifier: LGPL-3.0-or-later
// Vendored from omnibridge, see:
// <https://raw.githubusercontent.com/omni/omnibridge/master/contracts/interfaces/IOmnibridge.sol>
pragma solidity ^0.8.10;

interface IOmnibridge {
    function relayTokens(
        address _token,
        address _receiver,
        uint256 _value
    ) external;
}
