// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title X402Escrow
 * @notice Holds provider earnings and manages revenue distribution
 */
contract X402Escrow is Ownable, ReentrancyGuard {
    IERC20 public immutable paymentToken;
    address public platformTreasury;
    address public relayer; // Authorized relayer for gasless claims
    uint256 public platformFeePercent = 5; // 5%
    
    // Provider earnings tracking
    mapping(address => uint256) public providerBalances;
    mapping(address => uint256) public totalEarned;
    mapping(address => uint256) public totalClaimed;
    
    // Events
    event PaymentReceived(
        address indexed provider,
        address indexed payer,
        uint256 amount,
        uint256 platformFee,
        uint256 providerShare
    );
    event Claimed(address indexed provider, uint256 amount);
    event PlatformFeeUpdated(uint256 newFee);
    event TreasuryUpdated(address newTreasury);
    
    modifier onlyOwnerOrRelayer() {
        require(msg.sender == owner() || msg.sender == relayer, "Not authorized");
        _;
    }
    
    constructor(
        address _paymentToken,
        address _platformTreasury,
        address _relayer
    ) Ownable(msg.sender) {
        require(_paymentToken != address(0), "Invalid token");
        require(_platformTreasury != address(0), "Invalid treasury");
        
        paymentToken = IERC20(_paymentToken);
        platformTreasury = _platformTreasury;
        relayer = _relayer;
    }
    
    /**
     * @notice Receive payment and split between platform and provider
     * @dev Called by PaymentProcessor only (owner)
     */
    function receivePayment(
        address provider,
        address payer,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(provider != address(0), "Invalid provider");
        require(amount > 0, "Amount must be > 0");
        
        uint256 platformFee = (amount * platformFeePercent) / 100;
        uint256 providerShare = amount - platformFee;
        
        // Transfer platform fee to treasury
        if (platformFee > 0) {
            require(
                paymentToken.transfer(platformTreasury, platformFee),
                "Platform fee transfer failed"
            );
        }
        
        // Credit provider balance
        providerBalances[provider] += providerShare;
        totalEarned[provider] += providerShare;
        
        emit PaymentReceived(provider, payer, amount, platformFee, providerShare);
    }
    
    /**
     * @notice Provider claims their earnings
     */
    function claim() external nonReentrant {
        uint256 amount = providerBalances[msg.sender];
        require(amount > 0, "No balance to claim");
        
        providerBalances[msg.sender] = 0;
        totalClaimed[msg.sender] += amount;
        
        require(
            paymentToken.transfer(msg.sender, amount),
            "Claim transfer failed"
        );
        
        emit Claimed(msg.sender, amount);
    }
    
    /**
     * @notice Owner (PaymentProcessor) initiates withdrawal on behalf of provider
     * @param provider The provider's wallet address
     * @param amount Amount to withdraw (in token units)
     */
    function withdraw(address provider, uint256 amount) external onlyOwnerOrRelayer nonReentrant {
        require(provider != address(0), "Invalid provider");
        require(amount > 0, "Amount must be > 0");
        require(providerBalances[provider] >= amount, "Insufficient balance");
        
        providerBalances[provider] -= amount;
        totalClaimed[provider] += amount;
        
        require(
            paymentToken.transfer(provider, amount),
            "Withdraw transfer failed"
        );
        
        emit Claimed(provider, amount);
    }
    
    /**
     * @notice Get provider's complete earnings info
     */
    function getProviderInfo(address provider) external view returns (
        uint256 balance,
        uint256 earned,
        uint256 claimed
    ) {
        return (
            providerBalances[provider],
            totalEarned[provider],
            totalClaimed[provider]
        );
    }
    
    // Admin functions
    function setPlatformFee(uint256 newFee) external onlyOwner {
        require(newFee <= 20, "Fee cannot exceed 20%");
        platformFeePercent = newFee;
        emit PlatformFeeUpdated(newFee);
    }
    
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid address");
        platformTreasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }
}
