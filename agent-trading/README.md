# Agent Trading System

基于 LangChain 的交易 Agent，通过 x402 访问付费数据，在 Polymarket 执行交易。

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env with your keys

# 3. Run agent
python -m agent.main
```

## Configuration

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Qwen API key |
| `X402_MARKET_URL` | x402-market URL (ngrok or fixed) |
| `CLIENT_PRIVATE_KEY` | Wallet for x402 payments |
| `POLY_PRIVATE_KEY` | Wallet for Polymarket trading |
| `POLY_PROXY_ADDRESS` | Polymarket proxy address |

## MCP Tools

- `list_services` - Get available x402 services
- `execute_service` - Pay and get service content
- `get_market_by_slug` - Query Polymarket by slug
- `market_buy` - Place buy order (max 10 shares)

## Usage

```
> btc-2026-q1
Agent: Searching for services related to btc-2026-q1...
Agent: Found report "Bitcoin Q1 2026 Analysis", executing payment...
Agent: Analyzing report... Recommendation: BUY YES at 0.65
Agent: Placing order for 10 shares...
```
