// SPDX-License-Identifier: LGPL-3.0-or-later

pragma solidity ^0.8.10;

contract ReturnsConstructorParameter {
    uint256 private param;

    constructor(uint256 _param) {
        param = _param;
    }

    function ping() public view returns (uint256) {
        return param;
    }
}
