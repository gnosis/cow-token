// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../mixins/Vesting.sol";

contract VestingTestInterface is Vesting {
    constructor()
        Vesting() // solhint-disable-next-line no-empty-blocks
    {}

    function addVestingTest(
        address user,
        uint256 amount,
        bool isCancelableFlag
    ) external {
        addVesting(user, amount, isCancelableFlag);
    }

    function shiftVestingTest(address user, address freedVestingBeneficiary)
        external
        returns (uint256)
    {
        return shiftVesting(user, freedVestingBeneficiary);
    }

    function vestTest(address user) public returns (uint256) {
        return vest(user);
    }
}
