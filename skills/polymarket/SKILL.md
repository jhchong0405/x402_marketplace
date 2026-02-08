---
name: Polymarket API Development
description: Complete guide for Polymarket developer APIs including CLOB, Gamma, WebSocket, Data API, and SDKs
---

# Polymarket Developer API Guide

This skill provides comprehensive documentation for building trading applications on Polymarket.

## Architecture Overview

```mermaid
flowchart TB
    subgraph APIs
        GAMMA[Gamma API<br/>Market Discovery]
        CLOB[CLOB API<br/>Trading]
        WS[WebSocket<br/>Real-time Updates]
        DATA[Data API<br/>Positions & History]
        RTDS[RTDS<br/>Low-latency Streaming]
    end
    
    subgraph SDKs
        PY[py-clob-client<br/>Python]
        TS[@polymarket/clob-client<br/>TypeScript]
    end
    
    GAMMA --> |clobTokenIds| CLOB
    CLOB <--> WS
    SDKs --> APIs
```

---

## 1. API Endpoints

| API | Base URL | Purpose |
|-----|----------|---------|
| **Gamma API** | `https://gamma-api.polymarket.com` | Market discovery & metadata |
| **CLOB API** | `https://clob.polymarket.com` | Prices, orderbooks & trading |
| **Data API** | `https://data-api.polymarket.com` | Positions, activity & history |
| **WebSocket** | `wss://ws-subscriptions-clob.polymarket.com` | Real-time updates |

---

## 2. Data Model

### Hierarchy
```
Event (e.g., "2024 US Election")
  └── Market (e.g., "Will Biden win?")
        └── Outcomes (Yes/No with clobTokenIds)
```

### Key Fields
- **event.id** / **event.slug** - Event identifier
- **market.id** / **market.conditionId** - Market identifier  
- **market.clobTokenIds** - Array of `[YES_TOKEN_ID, NO_TOKEN_ID]` for trading
- **market.outcomes** - JSON string `"[\"Yes\", \"No\"]"`
- **market.outcomePrices** - JSON string `"[\"0.65\", \"0.35\"]"` (probabilities)
- **market.tickSize** - Minimum price increment (usually `"0.01"` or `"0.001"`)
- **market.negRisk** - Boolean or None, `true` for multi-outcome events (requires NegRiskAdapter for CTF operations)

> [!IMPORTANT]
> **ID Types Matter**: `token_id` (clobTokenIds) is used for orderbook/price queries. `condition_id` is used for `get_market()` and CTF operations. They are NOT interchangeable.

---

## 3. Gamma API - Market Discovery

### Fetch Active Events
```bash
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=10"
```

### Query Parameters
| Parameter | Description |
|-----------|-------------|
| `active` | Boolean, filter active events |
| `closed` | Boolean, filter closed events |
| `limit` | Number of results |
| `offset` | Pagination offset |
| `slug` | Filter by event slug |
| `tag_slug` | Filter by category (e.g., `crypto`, `sports`) |

### Get Market by Slug
```bash
curl "https://gamma-api.polymarket.com/markets?slug=will-bitcoin-reach-100k"
```

### Response Structure
```json
{
  "id": "123456",
  "slug": "will-bitcoin-reach-100k",
  "title": "Will Bitcoin reach $100k?",
  "markets": [
    {
      "id": "789",
      "question": "Will Bitcoin reach $100k?",
      "clobTokenIds": ["TOKEN_YES_ID", "TOKEN_NO_ID"],
      "outcomes": "[\"Yes\", \"No\"]",
      "outcomePrices": "[\"0.65\", \"0.35\"]",
      "tickSize": "0.01",
      "negRisk": false
    }
  ]
}
```

---

## 4. CLOB API - Trading

### Get Current Price
```bash
curl "https://clob.polymarket.com/price?token_id=TOKEN_ID&side=buy"
```

### Get Orderbook
```bash
curl "https://clob.polymarket.com/book?token_id=TOKEN_ID"
```

Response:
```json
{
  "market": "0x...",
  "asset_id": "TOKEN_ID",
  "bids": [
    {"price": "0.64", "size": "500"},
    {"price": "0.63", "size": "1200"}
  ],
  "asks": [
    {"price": "0.66", "size": "300"},
    {"price": "0.67", "size": "800"}
  ]
}
```

### Get Market Info
```bash
curl "https://clob.polymarket.com/markets/CONDITION_ID"
```

### Trading Fees
- **Maker**: 0% (provides liquidity)
- **Taker**: ~1.5-2% (takes liquidity)

---

## 5. WebSocket - Real-time Updates

### Connection
```
wss://ws-subscriptions-clob.polymarket.com/ws/market
wss://ws-subscriptions-clob.polymarket.com/ws/user
```

### Market Channel Subscription
```json
{
  "type": "subscribe",
  "channel": "market",
  "assets_ids": ["TOKEN_YES_ID", "TOKEN_NO_ID"]
}
```

### User Channel (Authenticated)
```json
{
  "type": "subscribe",
  "channel": "user",
  "auth": {
    "apiKey": "YOUR_API_KEY",
    "secret": "YOUR_SECRET",
    "passphrase": "YOUR_PASSPHRASE"
  },
  "markets": ["CONDITION_ID"]
}
```

### Message Types
| Channel | Event Types |
|---------|-------------|
| `market` | `price_change`, `book_update`, `trade` |
| `user` | `order_update`, `trade`, `position_update` |

### Keep-Alive
Send `PING` every 10 seconds to maintain connection.

---

## 6. Python SDK (py-clob-client)

### Installation
```bash
pip install py-clob-client
```

### Initialize Client
```python
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import ApiCreds
import os

HOST = "https://clob.polymarket.com"
CHAIN_ID = 137  # Polygon mainnet

# Step 1: Basic client for read operations
client = ClobClient(HOST, key=os.getenv("PRIVATE_KEY"), chain_id=CHAIN_ID)

# Step 2: Derive API credentials for trading
creds = client.derive_api_key()
# or create new: creds = client.create_api_key()

api_creds = ApiCreds(
    api_key=creds["apiKey"],
    api_secret=creds["secret"],
    api_passphrase=creds["passphrase"]
)

# Step 3: Full client with trading capabilities
client = ClobClient(
    HOST, 
    key=os.getenv("PRIVATE_KEY"), 
    chain_id=CHAIN_ID,
    creds=api_creds,
    signature_type=0,  # 0=EOA, 1=Gnosis Proxy, 2=Magic Link
    funder=os.getenv("FUNDER_ADDRESS")  # Usually your wallet address
)
```

### Place Order
```python
from py_clob_client.clob_types import OrderArgs, OrderType, PartialCreateOrderOptions
from py_clob_client.order_builder.constants import BUY, SELL

# IMPORTANT: get_market() uses condition_id, NOT token_id
condition_id = "0x..."  # From Gamma API market.conditionId
market = client.get_market(condition_id)

# market response includes: tokens[], minimum_tick_size, neg_risk
token_info = market["tokens"][0]  # {token_id, outcome, price, winner}

# CRITICAL: tick_size must be STRING, not float!
tick_size = str(market["minimum_tick_size"])  # "0.01" not 0.01

# Create order - returns SignedOrder
order = client.create_order(
    OrderArgs(
        token_id=token_info["token_id"],
        price=0.50,
        size=10.0,
        side=BUY,
    ),
    PartialCreateOrderOptions(
        tick_size=tick_size,  # Must be string!
        neg_risk=market.get("neg_risk", False),
    )
)

# Post order
response = client.post_order(order, OrderType.GTC)
# Response: {'orderID': '0x...', 'status': 'live', 'success': True}
print(f"Order ID: {response['orderID']}")
```


### Order Types
```python
from py_clob_client.clob_types import OrderType

# Good-Til-Cancelled (default)
order_type = OrderType.GTC

# Fill-Or-Kill
order_type = OrderType.FOK

# Good-Til-Date
order_type = OrderType.GTD
```

### Cancel Orders
```python
# Cancel single order
cancel_resp = client.cancel(order_id)
# Response: {'not_canceled': {}, 'canceled': ['0x...']}

# Cancel all orders
client.cancel_all()
```


### Fetch Orderbook
```python
# get_order_book uses token_id (clobTokenIds)
book = client.get_order_book(token_id)
# Returns OrderBookSummary with bids/asks as OrderSummary objects
print(f"Bids: {len(book.bids)} levels, Asks: {len(book.asks)} levels")
print(f"Best bid: {book.bids[0]}")
# Output: OrderSummary(price='0.14', size='500')
```

---

## 7. TypeScript SDK (@polymarket/clob-client)

### Installation
```bash
npm install @polymarket/clob-client ethers@5
```

### Initialize Client
```typescript
import { ClobClient } from "@polymarket/clob-client";
import { Wallet } from "ethers";

const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;
const signer = new Wallet(process.env.PRIVATE_KEY);

// Basic client
let client = new ClobClient(HOST, CHAIN_ID, signer);

// Derive API credentials
const userApiCreds = await client.createOrDeriveApiKey();

// Full authenticated client
client = new ClobClient(
  HOST,
  CHAIN_ID,
  signer,
  userApiCreds,
  0,  // signatureType: 0=EOA, 1=Gnosis, 2=MagicLink
  signer.address  // funder address
);
```

### Place Order
```typescript
import { Side, OrderType } from "@polymarket/clob-client";

const market = await client.getMarket("TOKEN_ID");

const response = await client.createAndPostOrder(
  {
    tokenID: "TOKEN_ID",
    price: 0.50,
    size: 10,
    side: Side.BUY,
  },
  {
    tickSize: market.tickSize,
    negRisk: market.negRisk,
  },
  OrderType.GTC
);

console.log("Order ID:", response.orderID);
```

---

## 8. Data API - Positions & History

### Get User Positions
```bash
curl "https://data-api.polymarket.com/positions?user=0xYOUR_PROXY_ADDRESS&limit=10"
```

Response fields (verified):
```json
{
  "proxyWallet": "0x...",
  "asset": "2849827...",
  "conditionId": "0x...",
  "size": 200,
  "avgPrice": 0.85,
  "initialValue": 170,
  "currentValue": 169,
  "cashPnl": -1,
  "percentPnl": -0.5882,
  "realizedPnl": -412,
  "curPrice": 0.845,
  "redeemable": false,
  "mergeable": false,
  "negativeRisk": false,
  "title": "Market Title",
  "outcome": "No",
  "outcomeIndex": 1
}
```

### Query Parameters
| Parameter | Description |
|-----------|-------------|
| `user` | Required - Proxy wallet address |
| `limit` | Max results (default 100, max 500) |
| `redeemable` | Filter redeemable positions |
| `mergeable` | Filter mergeable positions |

---


## 9. CTF Operations (Token Management)

CTF (Conditional Token Framework) operations for splitting/merging outcome tokens.

### Contract Addresses (Polygon)
| Contract | Address |
|----------|--------|
| **CTF (Conditional Tokens)** | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| **NegRiskAdapter** | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` |
| **USDC.e** | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |

### Market Types

> [!CAUTION]
> **NegRisk markets require NegRiskAdapter**. Standard CTF calls will fail with `SafeMath: subtraction overflow`.

- **Standard markets** (`negRisk: false`): Use CTF contract directly
- **NegRisk markets** (`negRisk: true`): Must use NegRiskAdapter contract

### Split (USDC → Outcome Tokens)
```python
# CTF.splitPosition() parameters:
collateralToken = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"  # USDC.e
parentCollectionId = bytes32(0)  # Always null for Polymarket
conditionId = "0x..."  # From Gamma API
partition = [1, 2]  # Binary: [0b01, 0b10] for Yes/No
amount = 10 * 10**6  # USDC has 6 decimals
```

### Merge (Outcome Tokens → USDC)
```python
# For standard markets:
CTF.mergePositions(collateralToken, parentCollectionId, conditionId, partition, amount)

# For NegRisk markets:
NegRiskAdapter.mergePositions(conditionId, amount)
```

### Redeem (After Resolution)
Claim USDC for winning outcome tokens after market resolves.

See `helpers/ctf_merge_split.py` for complete implementation including Gnosis Safe proxy support.

---

## 10. Authentication

### Signature Types
| Type | Value | Description |
|------|-------|-------------|
| EOA | `0` | Standard wallet (MetaMask, etc.) |
| Gnosis Safe | `1` | Gnosis Safe multisig wallet |
| **Polymarket Proxy** | `2` | **Most common** - Polymarket proxy wallet |

> [!TIP]
> Most Polymarket accounts use `signature_type=2`. Check your `exchanges/polymarket.py` for the correct value.

### API Credentials
- **API Key**: Persistent identifier
- **Secret**: Used for HMAC signing
- **Passphrase**: Additional auth layer

Credentials are derived from your wallet signature and are deterministic.

---

## 11. Common Patterns

### Market Discovery Flow
```python
# 1. Search for markets
events = requests.get(
    "https://gamma-api.polymarket.com/events",
    params={"active": "true", "tag_slug": "crypto", "limit": 10}
).json()

# 2. Extract token IDs
for event in events:
    for market in event["markets"]:
        token_ids = market["clobTokenIds"]  # [YES_ID, NO_ID]
        yes_token = token_ids[0]
        no_token = token_ids[1]
```

### BBO Monitoring
```python
# Using REST API
def get_bbo(token_id):
    book = requests.get(
        f"https://clob.polymarket.com/book?token_id={token_id}"
    ).json()
    
    best_bid = book["bids"][0] if book["bids"] else None
    best_ask = book["asks"][0] if book["asks"] else None
    return best_bid, best_ask
```

### WebSocket BBO Stream
```python
import websocket
import json

def on_message(ws, message):
    data = json.loads(message)
    if data.get("event_type") == "price_change":
        print(f"Price update: {data}")

ws = websocket.WebSocketApp(
    "wss://ws-subscriptions-clob.polymarket.com/ws/market",
    on_message=on_message
)

# Subscribe after connection
subscribe_msg = {
    "type": "subscribe",
    "channel": "market", 
    "assets_ids": ["TOKEN_YES_ID", "TOKEN_NO_ID"]
}
ws.send(json.dumps(subscribe_msg))
```

---

## 12. Error Handling

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid Signature` | Wrong signature type | Check `signatureType` matches wallet type |
| `L2 Auth Not Available` | Missing API creds | Call `derive_api_key()` or `createOrDeriveApiKey()` |
| `Not Enough Balance` | Insufficient USDC | Deposit USDCe on Polygon |
| `Invalid Order` | Bad price/size | Check `tickSize` and minimum order requirements |
| `Geoblock` | Restricted region | Use allowed jurisdiction or VPN |

### Rate Limits
- REST API: ~100 requests/minute
- WebSocket: Keep-alive with PING every 10s
- Order placement: Subject to per-user limits

---

## 13. Verified Tips & Gotchas

> [!TIP]
> These patterns were verified through actual API testing.

### Closed Markets Have No Orderbook
Markets with `closed: true` return `"No orderbook exists for the requested token id"`. Always check `market.closed` before querying orderbook.

### negRisk Can Be None
Gamma API may return `negRisk: None` instead of `true`/`false`. Handle this case:
```python
neg_risk = market.get("neg_risk") or False
```

### Orderbook Response Includes Hash
The `/book` endpoint returns a `hash` field useful for detecting changes:
```json
{"hash": "56c2fb39603bc7eef0386d00749f11fa852f22f5", ...}
```

### CTF Rate Limits
When running multiple merge operations, use:
- Private RPC (Alchemy/Infura) instead of `polygon-rpc.com`
- Serial execution with delays between operations
- Global lock to prevent concurrent merge transactions

### Gnosis Safe Integration
For proxy wallet operations, use `execTransaction` with proper signature:
```python
# See helpers/ctf_merge_split.py for _execute_via_proxy()
```

---


## 15. RTDS - Real-Time Data Socket

Low-latency WebSocket for market makers and crypto prices.

### Connection
```
wss://ws-live-data.polymarket.com
```

### Available Topics
- **Crypto Prices** - Real-time cryptocurrency price updates
- **Comments** - Comment events and reactions

### Message Structure
```json
{
  "topic": "crypto_prices",
  "type": "update",
  "timestamp": 1706547890123,
  "payload": { ... }
}
```

### Keep-Alive
Send `PING` every 5 seconds (more aggressive than CLOB WebSocket).

See `RTDS TypeScript client`: [real-time-data-client](https://github.com/Polymarket/real-time-data-client)

---

## 16. Environment Variables

Required `.env` configuration:
```bash
PRIVATE_KEY=0x...           # Wallet private key
POLYMARKET_PROXY_ADDRESS=0x... # Optional: Proxy/funder address

# RPC for CTF operations (avoid public RPC rate limits)
RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY

# For Builder integration
POLY_BUILDER_API_KEY=...
POLY_BUILDER_SECRET=...
POLY_BUILDER_PASSPHRASE=...
```

---



## 15. Verification Status

| Feature | Status | Notes |
|---------|--------|-------|
| **Gamma API** | ✅ Verified | Returns `clobTokenIds`, `negRisk`, `conditionId` |
| **CLOB API** | ✅ Verified | Price & Orderbook fetch working |
| **Data API** | ✅ Verified | Positions endpoint returns correct fields |
| **Authentication** | ✅ Verified | `signature_type=2` (Proxy) works |
| **Order Management** | ✅ Verified | Create/Post/Cancel orders working |
| **WebSocket** | ✅ Verified | Connection & Subscription confirmed |
| **RTDS** | ⚠️ Connection Verified | Connected but no data stream in short test |
| **CTF Operations** | 📝 Docs Only | Split/Merge/Redeem not tested on-chain |
| **NegRiskAdapter** | 📝 Docs Only | Contract interaction not tested on-chain |

## Resources

- [Official Docs](https://docs.polymarket.com)
- [GitHub - py-clob-client](https://github.com/Polymarket/py-clob-client)
- [GitHub - clob-client (TS)](https://github.com/Polymarket/clob-client)
- [Builder Program](https://docs.polymarket.com/developers/builders/builder-intro)
- [Market Makers Guide](https://docs.polymarket.com/developers/market-makers/introduction)
