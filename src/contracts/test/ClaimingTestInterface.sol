// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../mixins/Claiming.sol";
import "../mixins/NonTransferrableErc20.sol";

contract ClaimingTestInterface is Claiming, NonTransferrableErc20 {
    string private constant ERC20_SYMBOL = "TEST";
    string private constant ERC20_NAME = "ClaimingTestInterface";

    constructor(
        address _cowToken,
        address payable _communityFundsTarget,
        address _investorFundsTarget,
        address _usdcToken,
        uint256 _usdcPrice,
        address _gnoToken,
        uint256 _gnoPrice,
        address _wethToken,
        uint256 _wethPrice,
        address _teamController
    )
        Claiming(
            _cowToken,
            _communityFundsTarget,
            _investorFundsTarget,
            _usdcToken,
            _usdcPrice,
            _gnoToken,
            _gnoPrice,
            _wethToken,
            _wethPrice,
            _teamController
        )
        NonTransferrableErc20(ERC20_NAME, ERC20_SYMBOL)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function performClaimTest(
        ClaimType claimType,
        address payer,
        address account,
        uint256 amount,
        uint256 ethAmount
    ) public payable {
        performClaim(claimType, payer, account, amount, ethAmount);
    }

    function addInstantlySwappableTokens(address user, uint256 amount) public {
        instantlySwappableBalance[user] += amount;
        totalSupply += amount;
    }

    // === Start vesting mocking ===

    uint256 private vestOutput;

    event AddedVesting(address user, uint256 amount, bool isCancelable);

    function addToTotalSupply(uint256 amount) public {
        totalSupply += amount;
    }

    function mockVest(uint256 amount) public {
        vestOutput = amount;
    }

    function vest(address) internal view override returns (uint256) {
        return vestOutput;
    }

    function addVesting(
        address user,
        uint256 amount,
        bool isCancelable
    ) internal override {
        emit AddedVesting(user, amount, isCancelable);
    }

    // === End vesting mocking ===

    function balanceOf(address) public pure override returns (uint256) {
        revert("Not needed in test");
    }

    function shiftVesting(address, address)
        internal
        pure
        override
        returns (uint256)
    {
        // Not needed in test, but reverting would cause a compilation warning
        // because of this test interface.
        return 0;
    }

    receive() external payable // solhint-disable-next-line no-empty-blocks
    {

    }
}
