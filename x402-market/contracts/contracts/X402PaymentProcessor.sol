// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./X402Escrow.sol";
import "./X402ServiceRegistry.sol";

interface IERC20Permit {
    // EIP-3009: receiveWithAuthorization - anyone can call to execute an authorized transfer
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/**
 * @title X402PaymentProcessor
 * @notice Processes EIP-3009 gasless payments for x402 services
 */
contract X402PaymentProcessor is Ownable, ReentrancyGuard {
    IERC20Permit public immutable paymentToken;
    X402Escrow public immutable escrow;
    X402ServiceRegistry public serviceRegistry;
    
    // Nonce tracking to prevent replay attacks
    mapping(bytes32 => bool) public usedNonces;
    
    event PaymentProcessed(
        bytes32 indexed serviceId,
        address indexed payer,
        address indexed provider,
        uint256 amount,
        bytes32 nonce
    );
    
    constructor(
        address _paymentToken,
        address _escrow,
        address _serviceRegistry
    ) Ownable(msg.sender) {
        require(_paymentToken != address(0), "Invalid token");
        require(_escrow != address(0), "Invalid escrow");
        require(_serviceRegistry != address(0), "Invalid registry");
        
        paymentToken = IERC20Permit(_paymentToken);
        escrow = X402Escrow(_escrow);
        serviceRegistry = X402ServiceRegistry(_serviceRegistry);
    }
    
    /**
     * @notice Process x402 payment using EIP-3009
     * @param serviceId The service being paid for
     * @param from Payer address
     * @param value Payment amount
     * @param validAfter Signature valid after timestamp
     * @param validBefore Signature valid before timestamp
     * @param nonce Unique nonce for this authorization
     * @param v Signature component
     * @param r Signature component
     * @param s Signature component
     */
    function processPayment(
        bytes32 serviceId,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        // Check nonce hasn't been used
        require(!usedNonces[nonce], "Nonce already used");
        usedNonces[nonce] = true;
        
        // Get service details
        (
            address provider,
            uint256 price,
            bool isActive
        ) = serviceRegistry.getService(serviceId);
        
        require(isActive, "Service not active");
        require(value >= price, "Insufficient payment");
        
        // Execute EIP-3009 transfer to escrow (anyone can call receiveWithAuthorization)
        paymentToken.receiveWithAuthorization(
            from,
            address(escrow),
            value,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
        
        // Tell escrow to distribute funds
        escrow.receivePayment(provider, from, value);
        
        emit PaymentProcessed(serviceId, from, provider, value, nonce);
    }
    
    /**
     * @notice Update service registry
     */
    function setServiceRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "Invalid address");
        serviceRegistry = X402ServiceRegistry(newRegistry);
    }
}
