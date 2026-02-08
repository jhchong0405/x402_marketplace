"""
Polymarket Market Lookup

MCP tool for querying Polymarket markets by slug.
"""

import os
import json
import httpx
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

GAMMA_API_URL = "https://gamma-api.polymarket.com"


async def get_market_by_slug(slug: str) -> dict:
    """
    Get market information from Polymarket by slug.
    
    Args:
        slug: Market slug (e.g., "will-bitcoin-reach-100k")
        
    Returns:
        Market info including token IDs, prices, and metadata
    """
    async with httpx.AsyncClient() as client:
        print(f"[Agent] 🔎 Looking up Polymarket: {slug}")
        # First try to get as event slug
        response = await client.get(
            f"{GAMMA_API_URL}/events",
            params={"slug": slug},
            timeout=30.0,
        )
        
        data = response.json()
        
        # If found as event
        if data and len(data) > 0:
            event = data[0]
            markets = event.get("markets", [])
            
            if markets:
                market = markets[0]
                print(f"[Agent] ✅ Found market event: {event.get('title')}")
                return _format_market_response(event, market)
        
        # Try as market slug
        response = await client.get(
            f"{GAMMA_API_URL}/markets",
            params={"slug": slug},
            timeout=30.0,
        )
        
        data = response.json()
        
        if data and len(data) > 0:
            market = data[0]
            print(f"[Agent] ✅ Found specific market: {market.get('question')}")
            return _format_market_response(None, market)
        
        print(f"[Agent] ❌ Market not found: {slug}")
        return {"error": f"Market not found for slug: {slug}"}


def _format_market_response(event: Optional[dict], market: dict) -> dict:
    """Format market data for agent consumption."""
    # Handle clobTokenIds - can be list or JSON string
    clob_token_ids = market.get("clobTokenIds", [])
    if isinstance(clob_token_ids, str):
        try:
            clob_token_ids = json.loads(clob_token_ids)
        except json.JSONDecodeError:
            clob_token_ids = []
    
    # Parse outcomes and prices
    outcomes_raw = market.get("outcomes", '["Yes", "No"]')
    if isinstance(outcomes_raw, str):
        outcomes = json.loads(outcomes_raw)
    else:
        outcomes = outcomes_raw
    
    prices_raw = market.get("outcomePrices", '["0.5", "0.5"]')
    if isinstance(prices_raw, str):
        outcome_prices = json.loads(prices_raw)
    else:
        outcome_prices = prices_raw
    
    result = {
        "found": True,
        "market": {
            "id": market.get("id"),
            "condition_id": market.get("conditionId"),
            "question": market.get("question"),
            "slug": market.get("slug"),
            "closed": market.get("closed", False),
            "tick_size": market.get("tickSize", "0.01"),
            "neg_risk": market.get("negRisk") or False,
        },
        "tokens": [],
    }
    
    # Add event info if available
    if event:
        result["event"] = {
            "id": event.get("id"),
            "title": event.get("title"),
            "slug": event.get("slug"),
        }
    
    # Format tokens
    for i, token_id in enumerate(clob_token_ids):
        outcome = outcomes[i] if i < len(outcomes) else f"Outcome {i}"
        price = float(outcome_prices[i]) if i < len(outcome_prices) else 0.5
        
        result["tokens"].append({
            "token_id": token_id,
            "outcome": outcome,
            "price": price,
        })
    
    return result


async def get_market_price(token_id: str, side: str = "buy") -> dict:
    """
    Get current price for a token.
    
    Args:
        token_id: The CLOB token ID
        side: "buy" or "sell"
        
    Returns:
        Current price info
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://clob.polymarket.com/price",
            params={"token_id": token_id, "side": side},
            timeout=30.0,
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"Failed to get price: {response.status_code}"}


# CLI for testing
if __name__ == "__main__":
    import asyncio
    import argparse
    
    parser = argparse.ArgumentParser(description="Polymarket Market Lookup")
    parser.add_argument("--slug", type=str, required=True, help="Market slug")
    args = parser.parse_args()
    
    async def main():
        result = await get_market_by_slug(args.slug)
        print(json.dumps(result, indent=2))
    
    asyncio.run(main())
