// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../vendored/interfaces/MultiTokenMediatorInterface.sol";
import "../CowProtocolVirtualToken.sol";

/// @dev Contract contains the logic for deploying CowProtocolVirtualToken on gnosis chain
/// @author CoW Protocol Developers
contract DeploymentHelper {
    address public immutable foreignToken;
    address public immutable multiTokenMediator;
    bytes32 public immutable merkleRoot;
    address payable public communityFundsTarget;
    address public immutable gnoToken;
    uint256 public immutable gnoPrice;
    address public immutable wrappedNativeToken;
    uint256 public immutable nativeTokenPrice;

    constructor(
        address _foreignToken,
        address _multiTokenMediator,
        bytes32 _merkleRoot,
        address payable _communityFundsTarget,
        address _gnoToken,
        uint256 _gnoPrice,
        address _wrappedNativeToken,
        uint256 _nativeTokenPrice
    ) {
        foreignToken = _foreignToken;
        multiTokenMediator = _multiTokenMediator;
        merkleRoot = _merkleRoot;
        communityFundsTarget = _communityFundsTarget;
        gnoToken = _gnoToken;
        gnoPrice = _gnoPrice;
        wrappedNativeToken = _wrappedNativeToken;
        nativeTokenPrice = _nativeTokenPrice;
    }

    function deploy() external returns (address) {
        address bridgedToken = MultiTokenMediatorInterface(multiTokenMediator)
            .bridgedTokenAddress(foreignToken);

        // This requirement ensures that the CowProtocolVirtualToken can not be deployed
        // with the correct cowToken, before the cowToken has been bridged by the gnosisDAO.
        // Hence, the gnosisDAO is activating the deployment process
        require(bridgedToken != address(0), "cowToken not yet bridged");

        CowProtocolVirtualToken vCowToken = new CowProtocolVirtualToken(
            merkleRoot,
            bridgedToken,
            communityFundsTarget,
            address(0), // <-- investorFundsTarget
            address(0), // <-- USDC Token
            0, // <-- USDC price
            gnoToken,
            gnoPrice,
            wrappedNativeToken,
            nativeTokenPrice,
            address(0) // <-- team controller
        );
        return address(vCowToken);
    }
}
