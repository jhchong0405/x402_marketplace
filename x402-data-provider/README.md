# x402-data-provider

Independent data provider service for crypto analysis reports, integrated with x402-market platform for payment processing.

## Quick Start

```bash
# Start the service
npm start
```

Service runs on **http://localhost:4000**

Platform must be running on **http://localhost:3000**

## API Endpoints

### GET /api/reports
Lists available reports (free).

```bash
curl http://localhost:4000/api/reports
```

### GET /api/reports/:id
Get specific report (requires x402 payment).

```bash
# Returns 402 if no payment
curl http://localhost:4000/api/reports/btc-2026-q1

# Returns content with valid payment signature
curl http://localhost:4000/api/reports/btc-2026-q1 \
  -H "payment-signature: <base64_encoded_signature>"
```

## Available Reports

1. **Bitcoin Q1 2026 Analysis** (`btc-2026-q1`) - $2.00
2. **Ethereum DeFi Trends 2026** (`eth-defi-trends`) - $1.50

## Configuration

Edit `.env` to configure:
- `PORT`: Service port (default: 4000)
- `PLATFORM_URL`: x402-market URL
- `PLATFORM_WALLET`: Payment receiver address
- `PROVIDER_ID`: Your provider ID from platform

## Manual Testing Flow

### 1. Register on Platform
Visit http://localhost:3000/submit and register:
- **Endpoint:** `http://localhost:4000/api/reports/btc-2026-q1`
- **Price:** 2.0

### 2. Test Payment
Use x402-market demo page or custom client to:
1. Call endpoint without payment → Get 402
2. Sign EIP-3009 authorization
3. Call with payment signature → Get report content

### 3. Check Revenue
Visit http://localhost:3000/dashboard to see earnings.

## Architecture

```
Consumer → Data Provider (port 4000)
         ← 402 Payment Required

Consumer → Signs payment
         → Data Provider + signature

Data Provider → Platform /api/verify-payment
Platform → Settles on-chain
        → Tracks revenue (95% to you, 5% platform fee)
        ← Valid payment

Data Provider ← Payment verified
             → Returns content to consumer
```

## Files

- `index.js` - Main Express server
- `data/reports.json` - Report content
- `.env` - Configuration
- `test.js` - Integration test

## Customization

Edit `data/reports.json` to add your own reports:

```json
{
  "id": "unique-id",
  "title": "Report Title",
  "description": "Short description",
  "price": 2.5,
  "content": "Full report markdown content..."
}
```
