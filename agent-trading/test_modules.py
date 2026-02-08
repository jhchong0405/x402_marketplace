#!/usr/bin/env python3
"""Test all agent-trading modules."""

import asyncio
from mcp_server.tools import x402_client, polymarket_market, polymarket_trade

async def test_all():
    print('=' * 50)
    print('Testing All Modules')
    print('=' * 50)
    
    # Test 1: x402 list services
    print('\n[1] x402 list_services...')
    try:
        result = await x402_client.list_services()
        services = result.get('services', [])
        print(f'    ✅ Found {len(services)} services')
        for s in services[:2]:
            print(f'       - {s["name"]} ({s["price"]["display"]})')
    except Exception as e:
        print(f'    ❌ Error: {e}')
    
    # Test 2: Polymarket market lookup
    print('\n[2] polymarket_get_market...')
    try:
        result = await polymarket_market.get_market_by_slug('will-trump-win-2024')
        if result.get('found'):
            tokens = result.get('tokens', [])
            print(f'    ✅ Found market with {len(tokens)} tokens')
            for t in tokens[:2]:
                print(f'       - {t["outcome"]}: {t["token_id"][:20]}...')
        else:
            print(f'    ⚠️ Market not found')
    except Exception as e:
        print(f'    ❌ Error: {e}')
    
    # Test 3: Polymarket trade configured
    print('\n[3] polymarket_trade configured...')
    print(f'    Polymarket configured: {polymarket_trade.is_configured()}')
    
    # Test 4: Wallet address
    print('\n[4] Client wallet...')
    try:
        addr = x402_client.get_wallet_address()
        print(f'    ✅ Wallet: {addr}')
    except Exception as e:
        print(f'    ❌ Error: {e}')
    
    print('\n' + '=' * 50)
    print('All tests completed!')

if __name__ == '__main__':
    asyncio.run(test_all())
