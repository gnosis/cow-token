// SPDX-License-Identifier: LGPL-3.0-or-later

pragma solidity ^0.8.10;

import "../vendored/interfaces/IERC20.sol";
import "../vendored/libraries/SafeERC20.sol";

import "../interfaces/ClaimingInterface.sol";
import "../interfaces/VestingInterface.sol";

/// @dev The logic behind the claiming of virtual tokens and the swapping to
/// real tokens.
/// @title COW Virtual Token Claiming Logic
/// @author CoW Protocol Developers
abstract contract Claiming is ClaimingInterface, VestingInterface, IERC20 {
    using SafeERC20 for IERC20;

    /// @dev Prices are represented as fractions. For readability, the
    /// denominator is one unit of the virtual token (assuming it has 18
    /// decimals), in this way the numerator of a price is the number of atoms
    /// that have the same value as a unit of virtual token.
    uint256 internal constant PRICE_DENOMINATOR = 10**18;
    /// @dev Price numerator for the COW/USDC price. This is the number of USDC
    /// atoms required to obtain a full unit of virtual token from an option.
    uint256 public immutable usdcPrice;
    /// @dev Price numerator for the COW/GNO price. This is the number of GNO
    /// atoms required to obtain a full unit of virtual token from an option.
    uint256 public immutable gnoPrice;
    /// @dev Price numerator for the COW/WETH price. This is the number of WETH
    /// wei required to obtain a full unit of virtual token from an option.
    uint256 public immutable wethPrice;

    /// @dev The proceeds from selling options to the community will be sent to,
    /// this address.
    address payable public immutable communityFundsTarget;
    /// @dev All proceeds from known investors will be sent to this address.
    address public immutable investorFundsTarget;

    /// @dev Address of the real COW token. Tokens claimed by this contract can
    /// be converted to this token if this contract stores some balance of it.
    IERC20 public immutable cowToken;
    /// @dev Address of the USDC token. It is a form of payment for investors.
    IERC20 public immutable usdcToken;
    /// @dev Address of the GNO token. It is a form of payment for users who
    /// claim the options derived from holding GNO.
    IERC20 public immutable gnoToken;
    /// @dev Address of the WETH token. It is a form of payment for users who
    /// claim the options derived from being users of the CoW Protocol.
    IERC20 public immutable wethToken;

    /// @dev Address representing the CoW Protocol/CowSwap team. It is the only
    /// address that is allowed to stop the vesting of a claim, and exclusively
    /// for team claims.
    address public immutable teamController;

    /// @dev Time at which the claiming is started
    uint256 public immutable startTimestamp;

    /// @dev Returns the amount of virtual tokens in existence, including those
    /// that have yet to be vested.
    uint256 public totalSupply;

    /// @dev How many tokens can be immediately swapped in exchange for real
    /// tokens for each user.
    mapping(address => uint256) public instantlySwappableBalance;

    /// @dev Error presented to a user trying to claim virtual tokens after the
    /// claiming period has ended.
    error ClaimingExpired();
    /// @dev Error presented to anyone but the team controller to stop a
    /// cancelable vesting position (i.e., only team vesting).
    error OnlyTeamController();
    /// @dev Error resulting from sending an incorrect amount of eth to the
    /// contract.
    error InvalidEthAmount();
    /// @dev Error resulting from sending ETH for a claim that cannot be
    /// redeemed with ETH.
    error CannotSendEth();

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
        address _teamController,
        uint256 _startTimestamp
    ) {
        cowToken = IERC20(_cowToken);
        communityFundsTarget = _communityFundsTarget;
        investorFundsTarget = _investorFundsTarget;
        usdcToken = IERC20(_usdcToken);
        usdcPrice = _usdcPrice;
        gnoToken = IERC20(_gnoToken);
        gnoPrice = _gnoPrice;
        wethToken = IERC20(_wethToken);
        wethPrice = _wethPrice;
        teamController = _teamController;

        if (_startTimestamp == 0) {
            // solhint-disable-next-line not-rely-on-time
            _startTimestamp = block.timestamp;
        }
        startTimestamp = _startTimestamp;
    }

    /// @dev Allows the decorated function only to be executed before the
    /// contract deployment date plus the input amount of seconds.
    /// @param durationSinceDeployment Number of seconds after contract
    /// deployment before which the function can be executed anymore. The
    /// function reverts afterwards.
    modifier before(uint256 durationSinceDeployment) {
        // solhint-disable-next-line not-rely-on-time
        if (block.timestamp > startTimestamp + durationSinceDeployment) {
            revert ClaimingExpired();
        }
        _;
    }

    /// @dev The decorated function can only be executed by the team controller.
    modifier onlyTeamController() {
        if (msg.sender != teamController) {
            revert OnlyTeamController();
        }
        _;
    }

    /// @inheritdoc ClaimingInterface
    function performClaim(
        ClaimType claimType,
        address payer,
        address claimant,
        uint256 amount,
        uint256 sentEth
    ) internal override {
        if (claimType == ClaimType.Airdrop) {
            claimAirdrop(claimant, amount, sentEth);
        } else if (claimType == ClaimType.GnoOption) {
            claimGnoOption(claimant, amount, payer, sentEth);
        } else if (claimType == ClaimType.UserOption) {
            claimUserOption(claimant, amount, payer, sentEth);
        } else if (claimType == ClaimType.Investor) {
            claimInvestor(claimant, amount, payer, sentEth);
        } else if (claimType == ClaimType.Team) {
            claimTeam(claimant, amount, sentEth);
        } else {
            // claimType == ClaimType.Advisor
            claimAdvisor(claimant, amount, sentEth);
        }

        // Each claiming operation results in the creation of `amount` virtual
        // tokens.
        totalSupply += amount;
        emit Transfer(address(0), claimant, amount);
    }

    /// @dev Stops all vesting claims of a user. This is only applicable for
    /// claims that are cancellable, i.e., team claims.
    /// @param user The user whose vesting claims should be canceled.
    function stopClaim(address user) external onlyTeamController {
        uint256 accruedVesting = shiftVesting(user, teamController);
        instantlySwappableBalance[user] += accruedVesting;
    }

    /// @dev Performs an airdrop-type claim for the user.
    /// @param account The user for which the claim is performed.
    /// @param amount The full amount claimed by the user.
    function claimAirdrop(
        address account,
        uint256 amount,
        uint256 sentEth
    ) private before(6 weeks) {
        if (sentEth != 0) {
            revert CannotSendEth();
        }
        instantlySwappableBalance[account] += amount;
    }

    /// @dev Claims a Gno option for the user.
    /// @param account The user for which the claim is performed.
    /// @param amount The full amount claimed by the user after vesting.
    /// @param payer The address that pays the amount required by the claim.
    function claimGnoOption(
        address account,
        uint256 amount,
        address payer,
        uint256 sentEth
    ) private before(2 weeks) {
        if (sentEth != 0) {
            revert CannotSendEth();
        }
        collectPayment(gnoToken, gnoPrice, payer, communityFundsTarget, amount);
        addVesting(account, amount, false);
    }

    /// @dev Claims an Eth-based option for the user.
    /// @param account The user for which the claim is performed.
    /// @param amount The full amount claimed by the user after vesting.
    /// @param payer The address that pays the amount required by the claim.
    function claimUserOption(
        address account,
        uint256 amount,
        address payer,
        uint256 sentEth
    ) private before(2 weeks) {
        if (sentEth != 0) {
            collectEthPayment(communityFundsTarget, amount, sentEth);
        } else {
            collectPayment(
                wethToken,
                wethPrice,
                payer,
                communityFundsTarget,
                amount
            );
        }
        addVesting(account, amount, false);
    }

    /// @dev Claims an investor option.
    /// @param account The user for which the claim is performed.
    /// @param amount The full amount claimed by the user after vesting.
    /// @param payer The address that pays the amount required by the claim.
    function claimInvestor(
        address account,
        uint256 amount,
        address payer,
        uint256 sentEth
    ) private before(2 weeks) {
        if (sentEth != 0) {
            revert CannotSendEth();
        }
        collectPayment(
            usdcToken,
            usdcPrice,
            payer,
            investorFundsTarget,
            amount
        );
        addVesting(account, amount, false);
    }

    /// @dev Claims a team option. Team options are granted without any payment
    /// but can be canceled.
    /// @param account The user for which the claim is performed.
    /// @param amount The full amount claimed by the user after vesting.
    function claimTeam(
        address account,
        uint256 amount,
        uint256 sentEth
    ) private before(6 weeks) {
        if (sentEth != 0) {
            revert CannotSendEth();
        }
        addVesting(account, amount, true);
    }

    /// @dev Claims an adviser option. Team options are granted without any
    /// payment and cannot be canceled.
    /// @param account The user for which the claim is performed.
    /// @param amount The full amount claimed by the user after vesting.
    function claimAdvisor(
        address account,
        uint256 amount,
        uint256 sentEth
    ) private before(6 weeks) {
        if (sentEth != 0) {
            revert CannotSendEth();
        }
        addVesting(account, amount, false);
    }

    /// @dev Executes a transfer from the user to the target. The transfered
    /// amount is based on the input COW price and amount of COW bought.
    /// @param token The token used for the payment.
    /// @param price The number of atoms of the input token that are equivalent
    /// to one atom of COW multiplied by PRICE_DENOMINATOR.
    /// @param from The address from which to take the funds.
    /// @param to The address to which to send the funds.
    /// @param amount The amount of COW atoms that will be paid for.
    function collectPayment(
        IERC20 token,
        uint256 price,
        address from,
        address to,
        uint256 amount
    ) private {
        uint256 tokenEquivalent = convertCowAmountAtPrice(amount, price);
        token.safeTransferFrom(from, to, tokenEquivalent);
    }

    /// @dev Transfers eth from this contract to the target, assuming that the
    /// amount of ETH sent coincides with the expected amount of ETH. This
    /// amount is based on the price of WETH and amount of COW bought.
    /// @param to The address to which to send the funds.
    /// @param amount The amount of COW atoms that will be paid for.
    function collectEthPayment(
        address payable to,
        uint256 amount,
        uint256 sentEth
    ) private {
        uint256 ethEquivalent = convertCowAmountAtPrice(amount, wethPrice);
        if (sentEth != ethEquivalent) {
            revert InvalidEthAmount();
        }
        to.transfer(ethEquivalent);
    }

    /// @dev Converts input amount in COW token atoms to an amount in token
    /// atoms at the specified price.
    /// @param amount Amount of tokens to convert.
    /// @param price The number of atoms of the input token that are equivalent
    /// to one atom of COW *multiplied by PRICE_DENOMINATOR*.
    function convertCowAmountAtPrice(uint256 amount, uint256 price)
        private
        pure
        returns (uint256)
    {
        return (amount * price) / PRICE_DENOMINATOR;
    }

    /// @dev Converts an amount of (virtual) tokens from this contract to real
    /// tokens based on the claims previously performed by the caller.
    /// @param amount How many virtual tokens to convert into real tokens.
    function swap(uint256 amount) external {
        makeVestingSwappable();
        _swap(amount);
    }

    /// @dev Converts all available (virtual) tokens from this contract to real
    /// tokens based on the claims previously performed by the caller.
    /// @return swappedBalance The full amount that was swapped (i.e., virtual
    /// tokens burnt as well as real tokens received).
    function swapAll() external returns (uint256 swappedBalance) {
        swappedBalance = makeVestingSwappable();
        _swap(swappedBalance);
    }

    /// @dev Transfers real tokens to the message sender and reduces the balance
    /// of virtual tokens available. Note that this function assumes that the
    /// current contract stores enough real tokens to fulfill this swap request.
    /// @param amount How many virtual tokens to convert into real tokens.
    function _swap(uint256 amount) private {
        instantlySwappableBalance[msg.sender] -= amount;
        totalSupply -= amount;
        cowToken.safeTransfer(msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);
    }

    /// @dev Adds the currently vested amount to the immediately swappable
    /// balance.
    /// @return swappableBalance The maximum balance that can be swapped at
    /// this point in time by the caller.
    function makeVestingSwappable() private returns (uint256 swappableBalance) {
        swappableBalance =
            instantlySwappableBalance[msg.sender] +
            vest(msg.sender);
        instantlySwappableBalance[msg.sender] = swappableBalance;
    }
}
