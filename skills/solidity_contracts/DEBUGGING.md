---
description: Detailed debugging guide and lessons learned from x402 smart contract development
---

# Solidity & Hardhat Debugging Experience

This guide documents specific issues encountered and solutions found during the development of the x402 smart contract architecture.

## 1. Dependency Management Hell (Hardhat + Ethers)

### The Problem
Hardhat 2.19+ and Ethers v6 often conflict with older tutorials or plugins. The ecosystem is split between Ethers v5 (stable, widely supported) and v6 (new API, cleaner but breaking changes).

**Symptoms:**
- `TypeError: hre.ethers.getContractFactory is not a function`
- `TypeError: Cannot read properties of undefined (reading 'getSigners')`
- `TypeError: contract.waitForDeployment is not a function`

### The Solution: Explicit Versioning
We found stability by pinning these specific versions:

```json
"devDependencies": {
    "hardhat": "^2.19.0",
    "@nomiclabs/hardhat-ethers": "^2.2.3",
    "ethers": "^5.7.0" 
}
```

**Key API Differences (v5 vs v6):**

| Operation | Ethers v5 (Our Choice) | Ethers v6 (Newer) |
|-----------|------------------------|-------------------|
| Format | `ethers.utils.formatEther(val)` | `ethers.formatEther(val)` |
| Deploy | `await contract.deployed()` | `await contract.waitForDeployment()` |
| Address | `contract.address` | `await contract.getAddress()` |
| Parse | `ethers.utils.parseEther("1.0")` | `ethers.parseEther("1.0")` |

**Lesson**: Don't mix v5 and v6. If using `@nomiclabs/hardhat-ethers` (older plugin), you MUST use `ethers` v5.

## 2. Smart Contract Logic Verification

### EIP-3009 Integration
**Issue**: Who is the `to` address in the signature?
- **Misconception**: It's the `PaymentProcessor` contract.
- **Reality**: It depends on what the `PaymentProcessor` calls.
  - If it calls `transferWithAuthorization(from, address(escrow), ...)`
  - Then the user MUST sign `to = EscrowAddress`.
  - The `PaymentProcessor` is merely the *submitter* (msgSender).

**Debug Step**: verifying off-chain signatures requires exact matching of the `to` address that will be passed on-chain.

### Ownership & Permissions
**Issue**: Escrow `receivePayment` reverted.
- **Cause**: Function has `onlyOwner` modifier.
- **Initial Setup**: Owner was `Deployer` (wallet).
- **Runtime**: `PaymentProcessor` calls `receivePayment`.
- **Fix**: Must transfer ownership of Escrow to PaymentProcessor *after* deployment.

```javascript
// Critical configuration step
await escrow.transferOwnership(processor.address);
```

## 3. Testnet Deployment Quirks

### Conflux eSpace
- **Chain ID**: 71
- **Gas**: Behaves like standard EVM.
- **Nonce issues**: If running tests rapidly, `nonce too low` errors can occur.
- **Solution**: Use a single signer sequentially or manage nonces manually if parallelizing.

### Verification Script
We built a robust verification script (`test-deployment.js`) that checks:
1.  **Config**: Is the platform fee 5%?
2.  **State**: Is the owner correct?
3.  **Logic**: Can we actually register a service?
4.  **Links**: Do contracts reference each other correctly?

**Debugging Insight**: Just checking "deployment successful" is not enough. You must verify *state* (like ownership) post-deployment.

## 4. Backend Integration Challenges

### Relayer Implementation
**Current**: Direct `token.receiveWithAuthorization`.
**Required**: `PaymentProcessor.processPayment`.

**Why change?**
- Direct call: Tokens go to wallet, but *Escrow logic* (fee split, bookkeeping) is skipped.
- Contract call: Tokens move via Escrow, ensuring events and state updates occur.

**Lesson**: The smart contract is the source of truth. The backend should only be a *facilitator* (relayer), it should not implement business logic (like fee splitting) if that logic exists on-chain.

## 5. Advanced Debugging: The Black-Box Token Problem

### The Scenario
We attempted to integrate with an existing `MockUSDC` on testnet without access to its source code or ABI.

**The Symptom**
`invalid signature` errors when trying to execute EIP-3009 transactions, despite parameters looking correct.

**The Diagnostics**
1.  **Decompilation**: We used bytecode analysis (`diagnose-token.js`) to confirm `receiveWithAuthorization` selector existed.
2.  **Brute Force**: We tried varying `version` ("1", "2") and `name` ("MockUSDC", "USD Coin") in the EIP-712 domain.
3.  **Failure**: The token lacked standard `version()` or `DOMAIN_SEPARATOR()` getters, making it impossible to verify the required signature domain.

### The Solution: Controlled Test Environment
Instead of fighting the black box, we deployed our own `MockUSDC.sol`:
- **Standard Implementation**: OpenZeppelin v4.9.
- **Verifiable**: We know the exact ChainID, Name, and Version (1).
- **Debuggable**: We can read `DOMAIN_SEPARATOR` on-chain.

**Result**: Immediate success. The "Standard" signature worked on the first try with our own token.

### Diagnostic Technique: Direct Token Call
When `Relayer -> Processor -> Token` fails with a generic error:
1.  **Isolate**: Modify the test script to call `Token.receiveWithAuthorization` *directly* (bypassing Processor).
2.  **Result**:
    - If Direct Call fails: The issue is the Signature or Token logic.
    - If Direct Call succeeds: The issue is the Processor logic, Ownership, or Gas.
3.  **Example**: We used this to confirm our signature was valid, proving the failure was in the Processor's interaction (likely Gas or ownership context).

## 6. Dealing with "UNPREDICTABLE_GAS_LIMIT"

**Issue**: `estimateGas` reverts with execution reverted, but no reason string.
- This is common when a sub-call fails (e.g., `Escrow.transfer` failing inside `Processor`).
- Or when the node implementation (Conflux) has quirks with gas estimation for complex internal transactions.

**Workaround**:
Use a hardcoded, high gas limit in your scripts to bypass estimation and force the transaction to the network.
```javascript
{ gasLimit: 3000000 } // Force execution to see true on-chain result
```

## 8. Critical Bug: `transferWithAuthorization` vs `receiveWithAuthorization`

### The Scenario (2026-02-08)
`PaymentProcessor.processPayment()` was reverting with no error message on Conflux eSpace testnet. All system checks passed:
- Escrow ownership ✅
- Token configuration ✅
- Signature validation (tested directly) ✅
- Relayer CFX balance ✅ (76 CFX)

### The Debugging Journey

**Step 1: Isolate the Failure**
We modified the test script to call `Token.receiveWithAuthorization` *directly* with the **exact same signature parameters** used by `processPayment`:

```javascript
// Direct call with ORIGINAL signature (not a new one)
await token.receiveWithAuthorization(
    user.address,
    escrow.address,
    paymentAmount,  // Same as processPayment
    validAfter,
    validBefore,
    nonce,          // Same nonce
    v, r, s         // Same signature
);
```

**Result**: ✅ Success! This proved the signature was valid.

**Step 2: Analyze the Contract Code**
Looking at `X402PaymentProcessor.sol`:

```solidity
// BUG: Called non-existent function!
paymentToken.transferWithAuthorization(from, address(escrow), ...);
```

**The Problem**: EIP-3009 defines **two** similar functions:

| Function | Caller | Use Case |
|----------|--------|----------|
| `transferWithAuthorization` | **Sender** (the `from` address) | Self-authorized transfer |
| `receiveWithAuthorization` | **Anyone** (Relayer, Processor, etc.) | Third-party execution |

Our `MockUSDC` only implemented `receiveWithAuthorization` (which is correct for Relayer-based flows). But `PaymentProcessor` was calling `transferWithAuthorization`, which didn't exist!

### The Fix

```solidity
// FIXED: Use correct function name
interface IERC20Permit {
    function receiveWithAuthorization(...) external;  // Not transferWithAuthorization
}

// In processPayment:
paymentToken.receiveWithAuthorization(from, address(escrow), ...);
```

### Why Was This Hard to Debug?

1.  **Generic Revert**: Conflux eSpace didn't return "function not found" - just a blank revert.
2.  **Similar Names**: `transfer` vs `receive` WithAuthorization sounds like the same thing.
3.  **Interface Mismatch**: Solidity doesn't check at compile time if the target contract has the function.

### Key Takeaway

> **When calling external contracts via interface, verify the exact function name exists on the target contract.**

Use a diagnostic script to probe function selectors:

```javascript
const selector = ethers.utils.id("receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)").slice(0, 10);
// Check if this selector exists in token bytecode
```

### Gas Forwarding Investigation

During debugging, we investigated "Gas Forwarding" as a potential cause:
- **Definition**: When Contract A calls Contract B, A forwards a portion of its gas to B.
- **EVM Rule**: A must retain at least 1/64 of gas for itself (Solidity 0.8+).
- **Nested Calls**: Each layer consumes some gas, potentially starving deep calls.

**Outcome**: This was NOT the issue. The transaction used only ~87K gas (we provided 3M). The root cause was the function name mismatch.

**Lesson**: Always rule out the simplest causes (wrong function name, wrong address) before investigating complex issues (gas, nonce, timing).

---

## 9. Debugging Methodology Summary

When facing a "generic revert" or "no reason string" error:

### Step 1: Bisect the Call Stack
```
Relayer Script
    └── PaymentProcessor.processPayment()
            └── Token.receiveWithAuthorization()
            └── Escrow.receivePayment()
                    └── Token.transfer()
```

Call each level directly to find which one fails.

### Step 2: Verify Interfaces
- Is the function name correct?
- Does the target contract implement it?
- Check function selectors against bytecode.

### Step 3: Check Permissions
- `onlyOwner` modifiers
- Access control (who can call what?)
- Ownership transfers after deployment

### Step 4: Verify Configuration
- Contract addresses in `.env`
- Cross-contract references (Processor -> Escrow -> Token)
- Treasury addresses, fee percentages

### Step 5: Force Transactions
If `estimateGas` fails, bypass it:
```javascript
{ gasLimit: 3000000 }
```
This forces the transaction on-chain, giving you the real result.

---

## 10. Summary of Best Practices

1.  **Pin Dependencies**: Avoid `^` for critical libs like ethers/hardhat.
2.  **Verify State**: Write scripts that read contract state immediately after deployment.
3.  **Control Your Environment**: Don't rely on black-box testnet contracts for core protocol testing. Deploy your own mocks.
4.  **Isolate Failures**: Bisect the call stack (Script -> Contract A -> Contract B) by calling Contract B directly.
5.  **Force Gas**: When `estimateGas` lies or fails, force the transaction to see the real on-chain behavior.
6.  **Check Function Names**: EIP-3009 has two similar functions (`transfer*` vs `receive*`). Verify you're calling the correct one.
7.  **Probe Interfaces**: When integrating with external contracts, verify function selectors exist in bytecode.
