// SPDX-License-Identifier: LGPL-3.0-or-later

pragma solidity ^0.8.10;

import "../vendored/mixins/ERC20.sol";
import "../vendored/interfaces/IOmnibridge.sol";

contract OmniBridgeTransferSimulator is IOmnibridge {
    event Receiver(address);

    function relayTokens(
        address _token,
        address _receiver,
        uint256 _value
    ) external {
        // This simulates the transferFrom as it is done in the OmniBridge
        ERC20(_token).transferFrom(msg.sender, address(this), _value);
        // Emits an event to track the receiver
        emit Receiver(_receiver);
    }
}
