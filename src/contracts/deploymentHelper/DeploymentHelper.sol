// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../vendored/interfaces/MultiTokenMediatorInterface.sol";
import "../CowProtocolVirtualToken.sol";

/// @dev Contract contains the logic for deploying CotPRotocolVirtualToken on gnosis chain
/// @author CoW Protocol Developers
contract DeploymentHelper {
    address public immutable multiTokenMediator;
    bytes32 public immutable merkleRoot;
    address payable public communityFundsTarget;
    address public immutable investorFundsTarget;
    address public immutable usdcToken;
    uint256 public immutable usdcPrice;
    address public immutable gnoToken;
    uint256 public immutable gnoPrice;
    address public immutable wrappedNativeToken;
    uint256 public immutable nativeTokenPrice;
    address public immutable teamController;

    constructor(
        address _multiTokenMediator,
        bytes32 _merkleRoot,
        address payable _communityFundsTarget,
        address _investorFundsTarget,
        address _usdcToken,
        uint256 _usdcPrice,
        address _gnoToken,
        uint256 _gnoPrice,
        address _wrappedNativeToken,
        uint256 _nativeTokenPrice,
        address _teamController
    ) {
        multiTokenMediator = _multiTokenMediator;
        merkleRoot = _merkleRoot;
        communityFundsTarget = _communityFundsTarget;
        investorFundsTarget = _investorFundsTarget;
        usdcToken = _usdcToken;
        usdcPrice = _usdcPrice;
        gnoToken = _gnoToken;
        gnoPrice = _gnoPrice;
        wrappedNativeToken = _wrappedNativeToken;
        nativeTokenPrice = _nativeTokenPrice;
        teamController = _teamController;
    }

    function deploy(address foreignToken) external returns (address) {
        address bridgeToken = MultiTokenMediatorInterface(multiTokenMediator)
            .bridgedTokenAddress(foreignToken);

        // This requirement ensure that the CowProtocolVirtualToken can not be deployed
        // with the correct cowToken, before the token has been bridge by the cowDAO.
        // Hence, the cowDAO is activating the deployment process
        require(bridgeToken != address(0), "cowToken not yet bridged");

        CowProtocolVirtualToken vCowToken = new CowProtocolVirtualToken(
            merkleRoot,
            bridgeToken,
            communityFundsTarget,
            investorFundsTarget,
            usdcToken,
            usdcPrice,
            gnoToken,
            gnoPrice,
            wrappedNativeToken,
            nativeTokenPrice,
            teamController
        );
        return address(vCowToken);
    }
}
