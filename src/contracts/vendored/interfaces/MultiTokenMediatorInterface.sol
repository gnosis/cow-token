// SPDX-License-Identifier: LGPL-3.0-or-later
// Interface created from: https://github.com/omni/omnibridge/blob/b658c7c217e25c13e61ab9fb1a97010a5656b11e/contracts/upgradeable_contracts/components/bridged/BridgedTokensRegistry.sol
pragma solidity ^0.8.10;

interface MultiTokenMediatorInterface {
    /**
     * @dev Retrieves address of the bridged token contract associated with a specific native token contract on the other side.
     * @param _nativeToken address of the native token contract on the other side.
     * @return address of the deployed bridged token contract.
     */
    function bridgedTokenAddress(address _nativeToken)
        external
        view
        returns (address);
}
