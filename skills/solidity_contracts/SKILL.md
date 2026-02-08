---
description: Complete guide for developing, deploying, and testing Solidity smart contracts for decentralized payment systems
---

# Solidity Smart Contract Development Skill

## Overview

This skill covers end-to-end smart contract development for building decentralized payment and escrow systems. Based on the x402 payment gateway architecture, this guide provides battle-tested patterns for trustless payment processing, revenue distribution, and on-chain service registries.

---

## Architecture Pattern: Decentralized Payment Gateway

### Three-Contract System

```
┌─────────────────────────────────────────────────┐
│           X402PaymentProcessor                   │
│  - Validates EIP-3009 signatures                │
│  - Prevents replay attacks (nonce)              │
│  - Coordinates payment flow                     │
└───────┬─────────────────────────┬───────────────┘
        │                         │
        ↓                         ↓
┌───────────────────┐    ┌────────────────────────┐
│ ServiceRegistry   │    │ Escrow Contract        │
│ - Service catalog │    │ - Holds balances       │
│ - Pricing info    │    │ - Splits fees          │
│ - Provider mgmt   │    │ - Provider claims      │
└───────────────────┘    └────────────────────────┘
```

**Why three contracts?**
- **Separation of concerns**: Registry, payment logic, and fund management are independent
- **Upgradeability**: Can deploy new PaymentProcessor while keeping Escrow/Registry
- **Security**: Limited blast radius if one contract has issues

---

## Contract Templates

### 1. Escrow Contract

**Purpose**: Hold and distribute funds with automatic fee splitting

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract X402Escrow is Ownable, ReentrancyGuard {
    IERC20 public immutable paymentToken;
    address public platformTreasury;
    uint256 public platformFeePercent = 5; // 5%
    
    // Provider earnings tracking
    mapping(address => uint256) public providerBalances;
    mapping(address => uint256) public totalEarned;
    mapping(address => uint256) public totalClaimed;
    
    event PaymentReceived(address indexed provider, address indexed payer, uint256 amount, uint256 platformFee, uint256 providerShare);
    event Claimed(address indexed provider, uint256 amount);
    
    constructor(address _paymentToken, address _platformTreasury) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
        platformTreasury = _platformTreasury;
    }
    
    function receivePayment(address provider, address payer, uint256 amount) 
        external onlyOwner nonReentrant 
    {
        uint256 platformFee = (amount * platformFeePercent) / 100;
        uint256 providerShare = amount - platformFee;
        
        if (platformFee > 0) {
            require(paymentToken.transfer(platformTreasury, platformFee), "Fee transfer failed");
        }
        
        providerBalances[provider] += providerShare;
        totalEarned[provider] += providerShare;
        
        emit PaymentReceived(provider, payer, amount, platformFee, providerShare);
    }
    
    function claim() external nonReentrant {
        uint256 amount = providerBalances[msg.sender];
        require(amount > 0, "No balance");
        
        providerBalances[msg.sender] = 0;
        totalClaimed[msg.sender] += amount;
        
        require(paymentToken.transfer(msg.sender, amount), "Transfer failed");
        emit Claimed(msg.sender, amount);
    }
}
```

**Key Features**:
- ✅ Reentrancy protection
- ✅ Automatic fee splitting
- ✅ Trustless provider claims
- ✅ Complete earnings tracking

---

### 2. Payment Processor

**Purpose**: Validate signatures and coordinate payment flow

```solidity
interface IERC20Permit {
    function transferWithAuthorization(
        address from, address to, uint256 value,
        uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external;
}

contract X402PaymentProcessor is Ownable, ReentrancyGuard {
    IERC20Permit public immutable paymentToken;
    X402Escrow public immutable escrow;
    X402ServiceRegistry public serviceRegistry;
    
    mapping(bytes32 => bool) public usedNonces; // Replay protection
    
    event PaymentProcessed(bytes32 indexed serviceId, address indexed payer, address indexed provider, uint256 amount, bytes32 nonce);
    
    constructor(address _token, address _escrow, address _registry) Ownable(msg.sender) {
        paymentToken = IERC20Permit(_token);
        escrow = X402Escrow(_escrow);
        serviceRegistry = X402ServiceRegistry(_registry);
    }
    
    function processPayment(
        bytes32 serviceId, address from, uint256 value,
        uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external nonReentrant {
        require(!usedNonces[nonce], "Nonce used");
        usedNonces[nonce] = true;
        
        (address provider, uint256 price, bool isActive) = serviceRegistry.getService(serviceId);
        require(isActive && value >= price, "Invalid service or payment");
        
        // Execute EIP-3009 transfer to escrow
        paymentToken.transferWithAuthorization(from, address(escrow), value, validAfter, validBefore, nonce, v, r, s);
        
        // Distribute funds
        escrow.receivePayment(provider, from, value);
        
        emit PaymentProcessed(serviceId, from, provider, value, nonce);
    }
}
```

**Security Features**:
- ✅ Nonce-based replay protection
- ✅ Signature validation via EIP-3009
- ✅ Time-bound authorizations
- ✅ Service existence verification

---

### 3. Service Registry

**Purpose**: On-chain service catalog

```solidity
contract X402ServiceRegistry is Ownable {
    struct Service {
        bytes32 id;
        address provider;
        uint256 price;
        string name;
        string endpoint;
        bool isActive;
        uint256 createdAt;
    }
    
    mapping(bytes32 => Service) public services;
    mapping(address => bytes32[]) public providerServices;
    
    event ServiceRegistered(bytes32 indexed id, address indexed provider, uint256 price, string name);
    event ServiceUpdated(bytes32 indexed id, uint256 newPrice);
    
    function registerService(
        bytes32 id, address provider, uint256 price,
        string calldata name, string calldata endpoint
    ) external onlyOwner {
        require(services[id].provider == address(0), "Service exists");
        
        services[id] = Service({
            id: id,
            provider: provider,
            price: price,
            name: name,
            endpoint: endpoint,
            isActive: true,
            createdAt: block.timestamp
        });
        
        providerServices[provider].push(id);
        emit ServiceReg istered(id, provider, price, name);
    }
    
    function updatePrice(bytes32 id, uint256 newPrice) external {
        require(msg.sender == services[id].provider || msg.sender == owner(), "Not authorized");
        services[id].price = newPrice;
        emit ServiceUpdated(id, newPrice);
    }
    
    function getService(bytes32 id) external view returns (address provider, uint256 price, bool isActive) {
        Service storage service = services[id];
        return (service.provider, service.price, service.isActive);
    }
}
```

---

## Development Workflow

### Setup

```bash
# 1. Create contracts directory
mkdir contracts && cd contracts

# 2. Initialize npm
npm init -y

# 3. Install dependencies
npm install --save-dev hardhat@^2.19.0 @openzeppelin/contracts@^5.0.0 @nomiclabs/hardhat-ethers ethers@^5.7.0 dotenv --legacy-peer-deps

# 4. Create hardhat.config.js
cat > hardhat.config.js << 'EOF'
require("@nomiclabs/hardhat-ethers");
require("dotenv").config({ path: "../.env" });

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    confluxTestnet: {
      url: process.env.CONFLUX_RPC_URL || "https://evmtestnet.confluxrpc.com",
      accounts: process.env.RELAYER_PRIVATE_KEY ? [process.env.RELAYER_PRIVATE_KEY] : [],
      chainId: 71
    }
  }
};
EOF

# 5. Create directory structure
mkdir -p contracts scripts test
```

### Compile

```bash
npx hardhat compile
```

**Expected output**:
```
Compiled 7 Solidity files successfully
```

### Deploy

```bash
npx hardhat run scripts/deploy.js --network confluxTestnet
```

**Deployment script pattern**:
```javascript
const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
    
    // Deploy Registry
    const Registry = await hre.ethers.getContractFactory("X402ServiceRegistry");
    const registry = await Registry.deploy();
    await registry.deployed();
    
    // Deploy Escrow
    const Escrow = await hre.ethers.getContractFactory("X402Escrow");
    const escrow = await Escrow.deploy(TOKEN_ADDRESS, deployer.address);
    await escrow.deployed();
    
    // Deploy Processor
    const Processor = await hre.ethers.getContractFactory("X402PaymentProcessor");
    const processor = await Processor.deploy(TOKEN_ADDRESS, escrow.address, registry.address);
    await processor.deployed();
    
    // Configure ownership
    await escrow.transferOwnership(processor.address);
    
    // Save addresses
    const deployment = {
        ServiceRegistry: registry.address,
        Escrow: escrow.address,
        PaymentProcessor: processor.address
    };
    require('fs').writeFileSync('../deployment.json', JSON.stringify(deployment, null, 2));
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
```

---

## Testing Patterns

### Unit Tests (Hardhat)

```javascript
const { expect } = require("chai");

describe("X402Escrow", function() {
    let escrow, token, owner, provider, payer;
    
    beforeEach(async function() {
        [owner, provider, payer] = await ethers.getSigners();
        
        // Deploy mock token
        const Token = await ethers.getContractFactory("MockERC20");
        token = await Token.deploy();
        
        // Deploy escrow
        const Escrow = await ethers.getContractFactory("X402Escrow");
        escrow = await Escrow.deploy(token.address, owner.address);
    });
    
    it("Should split payment correctly", async function() {
        const amount = ethers.utils.parseEther("100");
        await token.mint(escrow.address, amount);
        
        await escrow.receivePayment(provider.address, payer.address, amount);
        
        const providerBalance = await escrow.providerBalances(provider.address);
        expect(providerBalance).to.equal(ethers.utils.parseEther("95")); // 95% after 5% fee
    });
    
    it("Should allow provider to claim", async function() {
        // ... setup payment ...
        
        await escrow.connect(provider).claim();
        
        const balance = await escrow.providerBalances(provider.address);
        expect(balance).to.equal(0);
    });
});
```

### Integration Tests

```javascript
describe("Full Payment Flow", function() {
    it("Should process end-to-end payment", async function() {
        // 1. Register service
        await registry.registerService(serviceId, provider.address, price, "Test", "http://test");
        
        // 2. User generates EIP-3009 signature
        const { v, r, s, nonce } = await generateSignature(user, processor.address, amount);
        
        // 3. Process payment
        await processor.processPayment(serviceId, user.address, amount, 0, MAX_UINT256, nonce, v, r, s);
        
        // 4. Verify balances
        expect(await escrow.providerBalances(provider.address)).to.equal(expectedShare);
        
        // 5. Provider claims
        await escrow.connect(provider).claim();
        expect(await token.balanceOf(provider.address)).to.equal(expectedShare);
    });
});
```

---

## Security Best Practices

### 1. Reentrancy Protection

```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MyContract is ReentrancyGuard {
    function sensitiveFunction() external nonReentrant {
        // Protected from reentrancy attacks
    }
}
```

### 2. Access Control

```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyContract is Ownable {
    function adminFunction() external onlyOwner {
        // Only owner can call
    }
}
```

### 3. Checks-Effects-Interactions Pattern

```solidity
function withdraw() external {
    uint256 amount = balances[msg.sender];
    
    // Checks
    require(amount > 0, "No balance");
    
    // Effects (update state BEFORE external calls)
    balances[msg.sender] = 0;
    totalWithdrawn += amount;
    
    // Interactions (external calls last)
    require(token.transfer(msg.sender, amount), "Transfer failed");
}
```

### 4. Nonce Management

```solidity
mapping(bytes32 => bool) public usedNonces;

function processWithNonce(bytes32 nonce, ...) external {
    require(!usedNonces[nonce], "Nonce already used");
    usedNonces[nonce] = true; // Mark as used BEFORE execution
    
    // ... rest of logic ...
}
```

---

## Gas Optimization

### Use `immutable` for Constructor-Set Values

```solidity
IERC20 public immutable token; // vs. IERC20 public token;

constructor(address _token) {
    token = IERC20(_token); // Set once, cheaper reads
}
```

### Pack Structs Efficiently

```solidity
// Bad: 3 storage slots
struct Service {
    uint256 price;    // slot 0
    bool isActive;    // slot 1
    address provider; // slot 2
}

// Good: 2 storage slots
struct Service {
    address provider; // slot 0 (20 bytes)
    uint96 price;     // slot 0 (12 bytes) - packed!
    bool isActive;    // slot 1 (1 byte)
}
```

### Batch Operations

```solidity
function registerServices(
    bytes32[] calldata ids,
    address[] calldata providers,
    uint256[] calldata prices
) external onlyOwner {
    for (uint i = 0; i < ids.length; i++) {
        services[ids[i]] = Service({...});
    }
}
```

---

## Common Pitfalls & Solutions

### Pitfall 1: Integer Overflow (Pre-0.8.0)

**Problem**: Arithmetic operations could overflow silently
**Solution**: Use Solidity 0.8+ (built-in overflow checks) or SafeMath

### Pitfall 2: Forgetting Access Control

**Problem**: Critical functions callable by anyone
**Solution**: Always use `onlyOwner`, `onlyRole`, or custom modifiers

### Pitfall 3: Front-Running

**Problem**: Malicious actors can see and front-run transactions
**Solution**: Use commit-reveal schemes or EIP-3009 (signature-based)

### Pitfall 4: Incorrect Ownership Transfer

**Problem**: Deploying contracts with wrong owner
**Solution**: Explicitly set owner in constructor and verify post-deployment

---

## Real-World Deployment

### x402 Payment Gateway (Deployed)

```
Network: Conflux eSpace Testnet (Chain ID: 71)
ServiceRegistry:  0x897B52A7e6e089d7FFdD3a4e7eAc58EF900765F1
Escrow:           0x83a684Df9f0954046C374EC17692Db615559f5e3
PaymentProcessor: 0x6997a38F2007dE03CAFA9e41F99C2b7fce4A126E
Token (mUSDC):    0xB6f2355db983518173A8cb3c1D94b92814950D89
```

**Deployment Verification**:
```bash
# Check contract code
npx hardhat verify --network confluxTestnet 0x897B52A7... 

# Interact with contract
npx hardhat console --network confluxTestnet
> const registry = await ethers.getContractAt("X402ServiceRegistry", "0x897B52A7...")
> await registry.getServiceCount()
```

---

## Integration with Backend

### Calling Contracts from Node.js

```javascript
const { ethers } = require('ethers');

// Setup provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.CONFLUX_RPC_URL);
const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);

// Load contract
const processor = new ethers.Contract(
    PAYMENT_PROCESSOR_ADDRESS,
    PaymentProcessorABI,
    relayer
);

// Process payment
async function processPayment(serviceId, payer, amount, signature) {
    const { v, r, s, nonce, validAfter, validBefore } = signature;
    
    const tx = await processor.processPayment(
        serviceId,
        payer,
        amount,
        validAfter,
        validBefore,
        nonce,
        v, r, s
    );
    
    await tx.wait(); // Wait for confirmation
    return tx.hash;
}
```

---

## Checklist for Production

- [ ] **Security Audit** by reputable firm (OpenZeppelin, Trail of Bits)
- [ ] **Test Coverage** ≥ 90%
- [ ] **Gas Optimization** review
- [ ] **Emergency Pause** mechanism implemented
- [ ] **Upgrade Path** defined (proxy pattern if needed)
- [ ] **Monitoring** for events and balance changes
- [ ] **Documentation** complete and clear
- [ ] **Bug Bounty** program established

---

## Resources

- **OpenZeppelin Contracts**: https://docs.openzeppelin.com/contracts/
- **Hardhat Documentation**: https://hardhat.org/docs
- **Solidity Style Guide**: https://docs.soliditylang.org/en/latest/style-guide.html
- **EIP-3009 Spec**: https://eips.ethereum.org/EIPS/eip-3009
- **ConsenSys Security Best Practices**: https://consensys.github.io/smart-contract-best-practices/

---

## Summary

This skill provides a complete framework for building decentralized payment systems:

✅ **Three-contract architecture** for separation of concerns
✅ **EIP-3009 gasless payments** for better UX
✅ **Automated fee splitting** and escrow
✅ **Provider self-custody** of earnings
✅ **Battle-tested security patterns**
✅ **Production deployment** on Conflux eSpace

Use this as a foundation for trustless, transparent payment gateways and expand based on your specific requirements.
