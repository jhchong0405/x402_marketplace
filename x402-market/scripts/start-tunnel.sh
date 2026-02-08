#!/bin/bash
# ==============================================
# x402 Market Public Tunnel Script
# Uses ngrok to expose local server to the internet
# ==============================================

set -e

PORT=${1:-3000}
NGROK_LOG="/tmp/ngrok.log"

echo "🚀 Starting x402 Market Public Tunnel..."
echo "   Local Port: $PORT"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed."
    echo "   Install: https://ngrok.com/download"
    exit 1
fi

# Check if x402-market is running
if ! curl -s "http://localhost:$PORT" > /dev/null 2>&1; then
    echo "⚠️  Warning: x402-market doesn't seem to be running on port $PORT"
    echo "   Start it with: pm2 start npm --name x402-market -- start"
    echo ""
fi

# Kill any existing ngrok process
pkill -f "ngrok http" 2>/dev/null || true
sleep 1

echo "📡 Starting ngrok tunnel..."
ngrok http $PORT --log=stdout > "$NGROK_LOG" 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
sleep 3

# Get the public URL from ngrok API
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$PUBLIC_URL" ]; then
    echo "❌ Failed to get public URL from ngrok"
    echo "   Check logs: $NGROK_LOG"
    exit 1
fi

echo ""
echo "✅ Tunnel Active!"
echo "================================================"
echo "🌐 Public URL: $PUBLIC_URL"
echo "🔗 Dashboard:  $PUBLIC_URL/dashboard"
echo "🤖 AI Plugin:  $PUBLIC_URL/.well-known/ai-plugin.json"
echo "📡 API Base:   $PUBLIC_URL/api"
echo "================================================"
echo ""
echo "📋 Update your .env if needed:"
echo "   NEXT_PUBLIC_BASE_URL=\"$PUBLIC_URL\""
echo ""
echo "🛑 To stop: kill $NGROK_PID or pkill ngrok"
echo ""
echo "📊 ngrok Dashboard: http://localhost:4040"
echo ""

# Keep script running to show ngrok output
echo "Press Ctrl+C to stop the tunnel..."
wait $NGROK_PID
