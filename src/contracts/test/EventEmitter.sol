// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

contract EventEmitter {
    event Event(address, bytes, uint256);

    function emitEvent(
        address a,
        bytes memory b,
        uint256 c
    ) external payable {
        emit Event(a, b, c);
    }
}
