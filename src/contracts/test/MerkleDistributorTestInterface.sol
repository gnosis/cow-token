// SPDX-License-Identifier: LGPL-3.0-or-later

pragma solidity 0.8.10;

import "../mixins/MerkleDistributor.sol";

contract MerkleDistributorTestInterface is MerkleDistributor {
    // solhint-disable-next-line no-empty-blocks
    constructor(bytes32 merkleRoot) MerkleDistributor(merkleRoot) {}

    event HasClaimed(
        ClaimType claimType,
        address payer,
        address claimant,
        uint256 amount,
        uint256 ethAmount
    );

    function performClaim(
        ClaimType claimType,
        address payer,
        address claimant,
        uint256 claimableAmount,
        uint256 ethAmount
    ) internal override {
        emit HasClaimed(claimType, payer, claimant, claimableAmount, ethAmount);
    }

    function claimName(ClaimType claim) public pure returns (string memory) {
        if (claim == ClaimType.Airdrop) {
            return "Airdrop";
        } else if (claim == ClaimType.GnoOption) {
            return "GnoOption";
        } else if (claim == ClaimType.UserOption) {
            return "UserOption";
        } else if (claim == ClaimType.Investor) {
            return "Investor";
        } else if (claim == ClaimType.Team) {
            return "Team";
        } else if (claim == ClaimType.Advisor) {
            return "Advisor";
        } else {
            return "invalid";
        }
    }
}
