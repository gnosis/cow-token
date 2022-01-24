// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../vendored/mixins/BridgedTokensRegistry.sol";
import "../CowProtocolVirtualToken.sol";

/// @dev Contract contains the logic for deploying CowProtocolVirtualToken on gnosis chain
/// This contract is needed, as the bridged CowToken address needs to be read from
/// bridge contract at deployment time. After the deployment is done,
/// the contract is no longer relevant
/// Only some claim types are available on gnosis chain, which means that some parameters
/// will not be used in the deployment.
/// @author CoW Protocol Developers
contract BridgedTokenDeployer {
    /// @dev The token address of the CowToken on the Ethereum chain
    address public immutable foreignToken;
    /// @dev Multi Token Mediator from the ombi-bridge. It is used to get the
    /// the address of the bridged CowToken
    address public immutable multiTokenMediator;
    /// @dev The merkle root of the Merkle tree from all claims for the gnosis chain
    bytes32 public immutable merkleRoot;
    /// @dev The proceeds from selling options to the community will be sent to,
    /// this address.
    address payable public communityFundsTarget;
    /// @dev Address of the GNO token. It is a form of payment for users who
    /// claim the options derived from holding GNO.
    address public immutable gnoToken;
    /// @dev Address of the wrapped native token. It is a form of payment for
    /// users who claim the options derived from being users of the CoW
    /// Protocol.
    address public immutable wrappedNativeToken;
    /// @dev Price numerator for the COW/GNO price. This is the number of GNO
    /// atoms required to obtain a full unit of virtual token from an option.
    uint256 public immutable gnoPrice;
    /// @dev Price numerator for the COW/native-token price. This is the number
    /// of native token wei required to obtain a full unit of virtual token from
    /// an option.
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

    /// @dev This function will deploy the virtual Cow Token on Gnosis chain.
    /// It will be called from the gnosisDao via the omnibrdige
    function deploy() external returns (address) {
        address bridgedToken = BridgedTokensRegistry(multiTokenMediator)
            .bridgedTokenAddress(foreignToken);

        // A call to this function will be triggered by another transaction from
        // the Ethereum chain. The COW token will not be deployed in the chain
        // that hosts this contract, but it will be a bridged token from the
        // Ethereum chain. Because of this, we need the token to be available
        // before the virtual token can be deployed.
        // Also the next require statement ensures that the CowProtocolVirtualToken
        // can not be deployed with the correct cowToken, before the cowToken has
        // been bridged by the gnosisDAO.
        require(bridgedToken != address(0), "cowToken not yet bridged");

        CowProtocolVirtualToken vCowToken = new CowProtocolVirtualToken(
            merkleRoot,
            bridgedToken,
            communityFundsTarget,
            address(0), // <-- investorFundsTarget // not needed as investors only invest on mainnet
            address(0), // <-- USDC Token // not needed as investors only invest on mainnet
            0, // <-- USDC price
            gnoToken,
            gnoPrice,
            wrappedNativeToken,
            nativeTokenPrice,
            address(0) // <-- teamController // not needed as team funds are only available on mainnet
        );
        return address(vCowToken);
    }
}
