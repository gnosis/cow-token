// SPDX-License-Identifier: LGPL-3.0-or-later
// Vendored from omnibridge, see:
<<<<<<< HEAD
// <https://github.com/omni/omnibridge/blob/b658c7c217e25c13e61ab9fb1a97010a5656b11e/contracts/upgradeable_contracts/components/bridged/BridgedTokensRegistry.sol>
=======
// <https://raw.githubusercontent.com/omni/omnibridge/b658c7c217e25c13e61ab9fb1a97010a5656b11e/contracts/upgradeable_contracts/components/bridged/BridgedTokensRegistry.sol>
>>>>>>> main
pragma solidity ^0.8.10;

import "./EternalStorage.sol";

/**
 * @title BridgedTokensRegistry
 * @dev Functionality for keeping track of registered bridged token pairs.
 */
contract BridgedTokensRegistry is EternalStorage {
<<<<<<< HEAD
    event NewTokenRegistered(address indexed nativeToken, address indexed bridgedToken);
=======
    event NewTokenRegistered(
        address indexed nativeToken,
        address indexed bridgedToken
    );
>>>>>>> main

    /**
     * @dev Retrieves address of the bridged token contract associated with a specific native token contract on the other side.
     * @param _nativeToken address of the native token contract on the other side.
     * @return address of the deployed bridged token contract.
     */
<<<<<<< HEAD
    function bridgedTokenAddress(address _nativeToken) public view returns (address) {
        return addressStorage[keccak256(abi.encodePacked("homeTokenAddress", _nativeToken))];
=======
    function bridgedTokenAddress(address _nativeToken)
        public
        view
        returns (address)
    {
        return
            addressStorage[
                keccak256(abi.encodePacked("homeTokenAddress", _nativeToken))
            ];
>>>>>>> main
    }

    /**
     * @dev Retrieves address of the native token contract associated with a specific bridged token contract.
     * @param _bridgedToken address of the created bridged token contract on this side.
     * @return address of the native token contract on the other side of the bridge.
     */
<<<<<<< HEAD
    function nativeTokenAddress(address _bridgedToken) public view returns (address) {
        return addressStorage[keccak256(abi.encodePacked("foreignTokenAddress", _bridgedToken))];
=======
    function nativeTokenAddress(address _bridgedToken)
        public
        view
        returns (address)
    {
        return
            addressStorage[
                keccak256(
                    abi.encodePacked("foreignTokenAddress", _bridgedToken)
                )
            ];
>>>>>>> main
    }

    /**
     * @dev Internal function for updating a pair of addresses for the bridged token.
     * @param _nativeToken address of the native token contract on the other side.
     * @param _bridgedToken address of the created bridged token contract on this side.
     */
<<<<<<< HEAD
    function _setTokenAddressPair(address _nativeToken, address _bridgedToken) internal {
        addressStorage[keccak256(abi.encodePacked("homeTokenAddress", _nativeToken))] = _bridgedToken;
        addressStorage[keccak256(abi.encodePacked("foreignTokenAddress", _bridgedToken))] = _nativeToken;

        emit NewTokenRegistered(_nativeToken, _bridgedToken);
    }
}
=======
    function _setTokenAddressPair(address _nativeToken, address _bridgedToken)
        internal
    {
        addressStorage[
            keccak256(abi.encodePacked("homeTokenAddress", _nativeToken))
        ] = _bridgedToken;
        addressStorage[
            keccak256(abi.encodePacked("foreignTokenAddress", _bridgedToken))
        ] = _nativeToken;

        emit NewTokenRegistered(_nativeToken, _bridgedToken);
    }
}
>>>>>>> main
