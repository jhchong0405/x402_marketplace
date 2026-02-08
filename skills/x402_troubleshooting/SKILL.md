---
name: x402 Protocol Troubleshooting
description: Diagnosis and resolution for common x402 payment and settlement issues
---

# x402 Protocol Troubleshooting Guide

## Issue: Payment Successful but Claimable Balance is 0

### Symptoms
- User pays successfully (Transaction confirmed on-chain).
- Tokens are deducted from Payer.
- Tokens are held by Escrow contract.
- `GET /api/revenue/wallet` returns `claimableBalance: 0`.

### Root Cause Analysis
The x402 Protocol uses a **PaymentProcessor** to atomically handle payments and update the Escrow ledger.
If the `Relayer` fails to use the `PaymentProcessor`, it falls back to a **Direct Token Transfer** (Legacy Mode).
- **Direct Transfer**: Moves tokens to Escrow but **does NOT** call `Escrow.receivePayment`. **Result: Funds trapped, Ledger not updated.**
- **PaymentProcessor**: Calls `receiveWithAuthorization` AND `Escrow.receivePayment`. **Result: Funds secured, Ledger updated.**

### Diagnosis Steps
1.  **Check Market Logs**:
    - Look for `[Relayer] Settling directly on token...` (BAD).
    - Look for `[Relayer] Settling via PaymentProcessor...` (GOOD).
2.  **Check `serviceId`**:
    - If `serviceId` is missing/undefined in `relayer.settle()`, it forces fallback.
3.  **Check Service Registration**:
    - The `PaymentProcessor` reverts if the service is not registered in `ServiceRegistry`.
    - Verification: Call `ServiceRegistry.getService(serviceIdHash)`.

### Solution
1.  **Register Service On-Chain**:
    - Ensure every service in DB has a corresponding on-chain registration.
    - ID Format: `keccak256(utf8(serviceUUID))`.
2.  **Update API Logic**:
    - Ensure `api/agent/execute` computes the hash and passes it to `relayer.settle(sig, serviceIdHash)`.
3.  **Check Environment**:
    - Ensure `PAYMENT_PROCESSOR_ADDRESS` is set in `.env`.
4.  **Rebuild Application**:
    - If running in production (`next start`), **YOU MUST RUN `npm run build`** after code changes.

## Issue: Signature Verification Failed

### Symptoms
- `interact-demo.js` fails with "Signature verification failed".

### Solution
1.  **Domain Separator**:
    - Ensure `name`, `version`, `chainId`, `verifyingContract` match the on-chain Token exactly.
    - Example: `Mock USD Coin` vs `MockUSDC`.
2.  **Spender/To Field**:
    - For `PaymentProcessor`, the `to` field in the signature must match the address expected by `receiveWithAuthorization`.
    - In `X402PaymentProcessor`, it calls `receiveWithAuthorization(..., to=Escrow)`. Thus, signature must be `to: EscrowAddress`.

## Issue: "402 Payment Required" from Provider

### Symptoms
- Gateway says payment successful, but Provider rejects request.

### Solution
1.  **HTTP Method**: Ensure Provider accepts `POST` (Gateway proxies via POST).
2.  **Header Verification**:
    - Gateway sends `X-402-TxHash`.
    - Provider must explicitly trust this header if verifying via Gateway.
