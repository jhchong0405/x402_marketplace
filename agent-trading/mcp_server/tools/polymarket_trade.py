"""
Polymarket Trading

MCP tool for executing trades on Polymarket.
"""

import os
import json
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

POLY_PRIVATE_KEY = os.getenv("POLY_PRIVATE_KEY", "")
POLY_PROXY_ADDRESS = os.getenv("POLY_PROXY_ADDRESS", "")
POLYGON_RPC_URL = os.getenv("POLYGON_RPC_URL", "https://polygon-rpc.com")

# Max shares for testing
MAX_SHARES = 10

# Check if polymarket is configured
def is_configured() -> bool:
    """Check if Polymarket trading is configured."""
    return bool(POLY_PRIVATE_KEY and POLY_PROXY_ADDRESS)


async def market_buy(
    token_id: str,
    size: float,
    price: Optional[float] = None,
    tick_size: str = "0.01",
    neg_risk: bool = False,
) -> dict:
    """
    Place a limit buy order on Polymarket.
    
    Args:
        token_id: The CLOB token ID to buy
        size: Number of shares (max 10 for testing)
        price: Limit price (0-1). If None, executes Market Order (FOK).
        tick_size: Market tick size
        neg_risk: Whether market uses neg risk adapter
        
    Returns:
        Order result or mock response if not configured
    """
    # Enforce max shares limit
    if size > MAX_SHARES:
        print(f"[Agent] ⚠️  Adjusting size from {size} to max {MAX_SHARES}")
        size = MAX_SHARES
    
    # Determine order type
    if price is None:
        price = 1.0  # Max price to ensure execution
        order_type_enum = OrderType.FOK
        msg_type = "MARKET"
    else:
        order_type_enum = OrderType.GTC
        msg_type = "LIMIT"

    print(f"[Agent] 📈 Preparing {msg_type} BUY order: {size} shares of {token_id} at price {price}")
    
    # If not configured, return mock response
    if not is_configured():
        print(f"[Agent] ⚠️  Polymarket not configured - executing in SIMULATION mode")
        return {
            "mock": True,
            "message": "Polymarket not configured - returning mock response",
            "order": {
                "token_id": token_id,
                "side": "BUY",
                "size": size,
                "price": price,
                "type": msg_type,
                "status": "simulated",
            },
            "note": "Configure POLY_PRIVATE_KEY and POLY_PROXY_ADDRESS to execute real trades",
        }
    
    # Real trading with py-clob-client
    try:
        from py_clob_client.client import ClobClient
        from py_clob_client.clob_types import OrderArgs, OrderType, PartialCreateOrderOptions
        from py_clob_client.order_builder.constants import BUY
        
        HOST = "https://clob.polymarket.com"
        CHAIN_ID = 137  # Polygon mainnet
        
        # Initialize client
        client = ClobClient(HOST, key=POLY_PRIVATE_KEY, chain_id=CHAIN_ID)
        
        # Derive API credentials
        creds = client.derive_api_key()
        
        from py_clob_client.clob_types import ApiCreds
        api_creds = ApiCreds(
            api_key=creds["apiKey"],
            api_secret=creds["secret"],
            api_passphrase=creds["passphrase"],
        )
        
        # Reinitialize with full credentials
        client = ClobClient(
            HOST,
            key=POLY_PRIVATE_KEY,
            chain_id=CHAIN_ID,
            creds=api_creds,
            signature_type=2,  # Polymarket proxy
            funder=POLY_PROXY_ADDRESS,
        )
        
        # Create order
        order = client.create_order(
            OrderArgs(
                token_id=token_id,
                price=price,
                size=size,
                side=BUY,
            ),
            PartialCreateOrderOptions(
                tick_size=tick_size,
                neg_risk=neg_risk,
            ),
        )
        
        # Post order
        print(f"[Agent] 🚀 Submitting order to Polymarket CLOB...")
        response = client.post_order(order, order_type_enum)
        
        print(f"[Agent] ✅ Order submitted! ID: {response.get('orderID')}")
        
        return {
            "success": True,
            "order_id": response.get("orderID"),
            "status": response.get("status"),
            "details": {
                "token_id": token_id,
                "side": "BUY",
                "size": size,
                "price": price,
            },
        }
        
    except ImportError:
        return {
            "error": "py-clob-client not installed",
            "fix": "pip install py-clob-client",
        }
    except Exception as e:
        return {
            "error": str(e),
            "token_id": token_id,
            "size": size,
            "price": price,
        }


async def get_positions() -> dict:
    """
    Get current positions (mock if not configured).
    """
    if not is_configured():
        return {
            "mock": True,
            "positions": [],
            "note": "Configure Polymarket credentials to see real positions",
        }
    
    # Real implementation would query Data API
    return {
        "positions": [],
        "note": "Position fetching not yet implemented",
    }


# CLI for testing
if __name__ == "__main__":
    import asyncio
    import argparse
    
    parser = argparse.ArgumentParser(description="Polymarket Trading")
    parser.add_argument("--buy", action="store_true", help="Test buy order")
    parser.add_argument("--token", type=str, help="Token ID")
    parser.add_argument("--size", type=float, default=1.0, help="Order size")
    parser.add_argument("--price", type=float, default=0.50, help="Order price")
    args = parser.parse_args()
    
    async def main():
        if args.buy and args.token:
            result = await market_buy(
                token_id=args.token,
                size=args.size,
                price=args.price,
            )
            print(json.dumps(result, indent=2))
        else:
            print("Polymarket configured:", is_configured())
    
    asyncio.run(main())
