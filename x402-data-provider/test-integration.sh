#!/bin/bash

echo "🧪 Testing Data Provider Integration"
echo ""

# Test 1: Check data provider is running
echo "1️⃣ Testing data provider service..."
DATA_PROVIDER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/reports)
if [ "$DATA_PROVIDER_STATUS" = "200" ]; then
    echo "✅ Data provider is running on port 4000"
else
    echo "❌ Data provider not responding (status: $DATA_PROVIDER_STATUS)"
    exit 1
fi

# Test 2: List reports
echo ""
echo "2️⃣ Listing available reports..."
REPORTS=$(curl -s http://localhost:4000/api/reports)
echo "$REPORTS" | jq '.'

# Test 3: Check x402 protection
echo ""
echo "3️⃣ Testing x402 payment requirement..."
PAYMENT_REQ=$(curl -s http://localhost:4000/api/reports/btc-2026-q1)
STATUS=$(echo "$PAYMENT_REQ" | jq -r '.error')
if [ "$STATUS" = "Payment Required" ]; then
    echo "✅ Endpoint correctly requires payment"
    PAY_TO=$(echo "$PAYMENT_REQ" | jq -r '.accepts[0].payTo')
    AMOUNT=$(echo "$PAYMENT_REQ" | jq -r '.accepts[0].maxAmountRequired')
    echo "   Pay to: $PAY_TO"
    echo "   Amount: $AMOUNT wei (2.0 tokens)"
else
    echo "❌ Expected 402 Payment Required"
fi

# Test 4: Check platform services
echo ""
echo "4️⃣ Checking platform service registry..."
PLATFORM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/services)
if [ "$PLATFORM_STATUS" = "200" ]; then
    echo "✅ Platform is responding"
    SERVICE_COUNT=$(curl -s http://localhost:3000/api/services | jq '. | length')
    echo "   Registered services: $SERVICE_COUNT"
else
    echo "❌ Platform not responding (status: $PLATFORM_STATUS)"
fi

echo ""
echo "✨ Basic integration tests completed!"
echo ""
echo "📝 Next steps:"
echo "1. Use x402-market frontend to test actual payment"
echo "2. Visit http://localhost:3000 and connect wallet"
echo "3. Try calling your registered service endpoint"
echo "4. Check revenue in http://localhost:3000/dashboard"
