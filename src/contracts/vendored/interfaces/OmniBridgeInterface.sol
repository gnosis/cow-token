// SPDX-License-Identifier: LGPL-3.0-or-later
// copy from https://github.com/omni/omnibridge/blob/master/contracts/interfaces/IOmnibridge.sol
pragma solidity ^0.8.10;

interface OmniBridgeInterface {
    function relayTokens(
        address _token,
        address _receiver,
        uint256 _value
    ) external;
}
