---
name: Conflux x402 Payment Protocol
description: Learn how to implement standard and gasless (EIP-3009) x402 payment flows on Conflux eSpace.
---

# Conflux x402 Payment Protocol Skill

This skill guides you through implementing an x402-compliant payment flow on the Conflux eSpace network (EVM compatible). It covers both standard native token payments and advanced **gasless payments** using EIP-3009 and a Relayer.

## Prerequisites

- **Node.js** (v18+)
- **Two eSpace Wallets**:
  - **Server (Relayer)**: Needs CFX to pay for gas.
  - **Client**: Needs mUSDC (or other payment token) to pay for service.
- **Dependencies**: `@x402/express`, `@x402/core`, `@x402/evm`, `ethers`, `express`.

## Implementation Types

### 1. Standard Payment (Native CFX)
The client pays gas and transfers CFX directly to the server's address.
- **Scheme**: `ExactEvmScheme` (Native)
- **Facilitator**: Checks chain for transaction receipt.
- **Client**: Sends normal `sendTransaction`.

### 2. Gasless Payment (EIP-3009 / USDC)
The client signs an authorization, and the server (Relayer) submits it on-chain, paying the gas.
- **Scheme**: Custom `GaslessScheme` (Tunnel Mode)
- **Facilitator**: Acts as Relayer, submitting signed messages to `receiveWithAuthorization`.
- **Client**: Signs EIP-712 Typed Data.

---

---

## Configuration (.env)

Separate the Relayer (Server) and Payer (Client) wallets for proper testing.

```env
# Server (Relayer) - Pays Gas
SERVER_PRIVATE_KEY=0x...

# Client (Payer) - Signs Authorization
CLIENT_PRIVATE_KEY=0x...
```

---

## Gasless Implementation Guide (Advanced)

Implementing a gasless flow requires bypassing some standard x402 library validations to "tunnel" the full signature payload to the server.

### Architecture

1.  **Client**: Requests resource -> Receives 402 -> Signs EIP-712 -> Sends Signature in `payment-signature` header.
2.  **Server (Relayer)**: Receives Signature -> Verifies it -> Submits `receiveWithAuthorization` tx to contract -> Returns Resource.

### Key Components

#### 1. Custom Gasless Scheme (The Tunnel)
Standard schemes expect a simple Transaction Hash. For gasless, we need to send the full signature (v, r, s, nonce). We use a custom scheme object to pass the payload through without strict validation.

```javascript
const gaslessScheme = {
    scheme: "exact", // Hijack 'exact' or use custom name
    get name() { return "exact"; },
    deserialize(token) { return token; }, // Pass-through raw token
    registerMoneyParser(parser) { this.moneyParsers.push(parser); return this; },
    parsePrice(amount, network) { /* ... implementation ... */ },
    enhancePaymentRequirements(req) { return req; }
};
```

#### 2. Relayer Facilitator
The facilitator acts as the Relayer. In `verify`, it decodes the signature. In `settle`, it submits the transaction using the **Server's Wallet**.

```javascript
class RelayerFacilitatorClient {
    constructor() {
        // Use SERVER_PRIVATE_KEY
        this.wallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, provider);
    }

    async verify(payload, requirements) {
        // Decode payload.proof (Tunnel Mode)
        // Verify signature matches 'from' address
        return { isValid: true, ... };
    }
    async settle(payload, requirements) {
        // Call contract.receiveWithAuthorization(...)
        // Server pays GAS here
    }
}
```

#### 3. Client Bundling (Tunneling)
The client must bundle the signature into a Base64 JSON string and put it in the `proof` field.
**CRITICAL:** The client must also echo back the exact `accepted` requirements object, otherwise the server middleware will reject the request.

```javascript
const tokenPayload = {
    x402Version: 2,
    accepted: paymentInfo.accepts[0], // MUST ECHO EXACT REQUIREMENTS
    proof: base64SignatureData // Tunnel signature here
};
```

### Critical Implementation Details

> [!IMPORTANT]
> **Dynamic Relayer Address**: The `payTo` address in the payment requirements MUST match the Relayer's wallet address (`msg.sender`). If they mismatch, the `receiveWithAuthorization` contract call will revert. Always set `payTo` dynamically from the Relayer's wallet.

> [!TIP]
> **Async Initialization**: Registering custom schemes often requires the server to be fully initialized before handling requests. Wrap your server setup in an `async` function and `await resourceServer.initialize()`.

> [!WARNING]
> **Matching Logic**: The `@x402/core` library performs a deep equality check on the requirements. If your client modifies the requirements list (e.g., dropping fields like `extra` or `maxTimeoutSeconds`), the match will fail. Always use the object provided by the server.

---

## Standard Payment Implementation (Reference)

For simple native token payments, you can use the standard `ExactEvmScheme` with a custom money parser.

```javascript
// Money Parser for CFX
evmScheme.registerMoneyParser((amount, network) => {
    if (network === "eip155:71") {
        return {
            amount: ethers.utils.parseEther(amount.toString()).toString(),
            asset: "0x0000000000000000000000000000000000000000", // Native
            extra: { symbol: "CFX", decimals: 18 }
        };
    }
    return null;
});
```


## Performance Optimization

To reduce latency (~15s -> ~2s), considering the following strategies:

### 1. Optimistic Response (Recommended with Caution)
Don't wait for the blockchain confirmation (`tx.wait()`) before responding to the client.
- **Flow**: Verify Signature -> Submit Tx -> **Respond 200 OK immediately** -> Monitor Confirmation in background.
- **Benefit**: User feels "instant" response (~2s).
- **Risk**: 
    - **Freeloading**: If the user moves their funds immediately after signing (front-running), the payment will fail on-chain, but they already received the content.
    - **Gas Griefing**: The Relayer (Server) pays gas even if the transaction reverts. An attacker could drain the server's gas by sending many valid-looking requests that fail on-chain.
- **Mitigation**: 
    - Only use for low-value content (e.g., articles, API calls).
    - Implement Rate Limiting and Blacklisting for addresses that cause failed transactions.


### 2. Parallel Processing (Nonce Management)
To handle high throughput, you must manage the Relayer's `nonce` manually.
- Fetch `nonce` once, then increment locally for each subsequent transaction.
- Allows sending 100+ txs per second without waiting for the previous one to mine.

### 3. Dedicated RPC
Public endpoints like `evmtestnet.confluxrpc.com` are rate-limited.
### 4. Confirmation Depth Recommendations
- **1 Confirmation (Default)**: `await tx.wait(1)`. Takes ~15s. Good balance for most apps.
- **Optimistic (0 Confirmation)**: Immediate response. Best for UX.
- **Safe (50+ Confirmations)**: For high-value transfers. Takes ~1 minute.
- **Finalized (400+ Confirmations)**: For exchanges/bridges. Takes ~6 minutes.



- `examples/server.js`: Complete Gasless Server implementation.
- `examples/client.js`: Complete Gasless Client implementation.
- `examples/contracts/`: Smart contracts (MockUSDC) and deployment scripts.

