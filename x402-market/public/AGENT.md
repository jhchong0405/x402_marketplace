---
description: Discover and pay for APIs using x402 protocol on Conflux eSpace.
---

# x402 Market Agent Skill

> **For AI Agents**: This document describes how to discover, evaluate, and pay for API services on the x402 Market platform.

## Overview

x402 Market is a pay-per-call API marketplace. You can:
1. **Discover** available services via structured API
2. **Evaluate** pricing and capabilities
3. **Pay** using EIP-3009 gasless signatures
4. **Consume** the paid API immediately

## Quick Reference

| Endpoint | Purpose |
|----------|---------|
| `GET /api/agent/services` | List all available services (agent-optimized) |
| `GET /api/agent/services/{id}` | Get service details + payment requirements |
| `POST /api/agent/execute` | Execute a paid API call |
| `GET /.well-known/ai-plugin.json` | OpenAI plugin-compatible manifest |

---

## Step 1: Discover Services

```http
GET /api/agent/services
```

**Response:**
```json
{
  "services": [
    {
      "id": "abc123",
      "name": "Image Generation API",
      "description": "Generate images from text prompts using DALL-E",
      "endpoint": "https://provider.com/api/generate",
      "price": {
        "amount": "1000000000000000000",
        "display": "1.0 mUSDC",
        "token": "0xB6f2355db983518173A8cb3c1D94b92814950D89"
      },
      "payTo": "0xC08CC32481e49C167f505EdB5717ab6212012c07",
      "tags": ["ai", "image", "generation"],
      "openApiSpec": { ... }
    }
  ]
}
```

**Filter by tag:**
```http
GET /api/agent/services?tag=ai
```

**Search by keyword:**
```http
GET /api/agent/services?search=image
```

---

## Step 2: Evaluate a Service

```http
GET /api/agent/services/{id}
```

**Response includes:**
- Full description
- Pricing in human and wei formats
- OpenAPI specification (if provided)
- Payment requirements for x402

---

## Step 3: Execute with Payment

To call a paid service, use the unified execution endpoint:

```http
POST /api/agent/execute
Content-Type: application/json

{
  "serviceId": "abc123",
  "walletAddress": "0xYOUR_WALLET",
  "signature": {
    "from": "0xYOUR_WALLET",
    "to": "0xPAY_TO_ADDRESS",
    "value": "1000000000000000000",
    "validAfter": 0,
    "validBefore": 1707300000,
    "nonce": "0x...",
    "v": 27,
    "r": "0x...",
    "s": "0x..."
  },
  "requestBody": {
    "prompt": "A cute cat wearing a hat"
  }
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "response": {
    "imageUrl": "https://..."
  }
}
```

---

## Signing Payment (EIP-3009)

To pay for a service, sign an EIP-712 typed data message:

### Domain
```json
{
  "name": "Mock USD Coin",
  "version": "1",
  "chainId": 71,
  "verifyingContract": "0xB6f2355db983518173A8cb3c1D94b92814950D89"
}
```

### Types
```json
{
  "ReceiveWithAuthorization": [
    { "name": "from", "type": "address" },
    { "name": "to", "type": "address" },
    { "name": "value", "type": "uint256" },
    { "name": "validAfter", "type": "uint256" },
    { "name": "validBefore", "type": "uint256" },
    { "name": "nonce", "type": "bytes32" }
  ]
}
```

### Message
```json
{
  "from": "YOUR_WALLET_ADDRESS",
  "to": "SERVICE_PAY_TO_ADDRESS",
  "value": "PRICE_IN_WEI",
  "validAfter": 0,
  "validBefore": "UNIX_TIMESTAMP + 3600",
  "nonce": "RANDOM_32_BYTES"
}
```

---

## Decision Framework

When choosing a service:

1. **Match task to tags** - Filter services by relevant tags
2. **Compare pricing** - Lower `price.amount` = cheaper
3. **Check OpenAPI spec** - Ensure API accepts your input format
4. **Verify payTo address** - This is where your tokens go

---

## Example Agent Workflow

```
1. User: "Generate an image of a sunset"

2. Agent thinks:
   - Need image generation service
   - GET /api/agent/services?tag=image

3. Agent evaluates:
   - Service A: 1.0 mUSDC, has DALL-E
   - Service B: 0.5 mUSDC, has Stable Diffusion
   - Choose Service B (cheaper)

4. Agent signs EIP-3009 authorization

5. Agent calls:
   POST /api/agent/execute
   { serviceId: "B", signature: {...}, requestBody: { prompt: "sunset" } }

6. Agent receives image URL, returns to user
```

---

## Network Configuration

| Parameter | Value |
|-----------|-------|
| Chain | Conflux eSpace Testnet |
| Chain ID | 71 |
| RPC | https://evmtestnet.confluxrpc.com |
| Token | MockUSDC (0xB6f2355db983518173A8cb3c1D94b92814950D89) |

---

## Error Handling

| Status | Meaning |
|--------|---------|
| 402 | Payment required - sign and retry |
| 400 | Invalid signature or request |
| 404 | Service not found |
| 500 | Settlement failed (retry) |

---

## Available Services

<!-- AUTO-GENERATED: Do not edit below this line -->
<!-- This section is automatically updated when new services are registered -->

### Currently Available (1 service)

#### Bitcoin Q1 2026 Analysis

Deep dive into BTC fundamentals and price outlook

- **Provider:** PKUBA
- **Price:** 2 Token
- **Endpoint:** `http://localhost:4000/api/reports/btc-2026-q1`
- **Tags:** `crypto` `bitcoin` `analysis`
- **Service ID:** `74263c89-f421-4462-901b-d77cdcc47ded`

---


<!-- END AUTO-GENERATED -->
