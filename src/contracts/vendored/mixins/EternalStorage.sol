// SPDX-License-Identifier: LGPL-3.0-or-later
// Vendored from omnibridge, see:
// <https://raw.githubusercontent.com/omni/omnibridge/b658c7c217e25c13e61ab9fb1a97010a5656b11e/contracts/upgradeability/EternalStorage.sol>
pragma solidity ^0.8.10;


/**
 * @title EternalStorage
 * @dev This contract holds all the necessary state variables to carry out the storage of any contract.
 */
contract EternalStorage {
    mapping(bytes32 => uint256) internal uintStorage;
    mapping(bytes32 => string) internal stringStorage;
    mapping(bytes32 => address) internal addressStorage;
    mapping(bytes32 => bytes) internal bytesStorage;
    mapping(bytes32 => bool) internal boolStorage;
    mapping(bytes32 => int256) internal intStorage;
}
