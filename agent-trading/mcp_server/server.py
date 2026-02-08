"""
MCP Server for Agent Trading

Exposes x402 and Polymarket tools via MCP protocol.
"""

import asyncio
import json
from mcp.server.models import InitializationOptions
from mcp.server import Server
from mcp.types import Tool, TextContent
from pydantic import AnyUrl

from .tools import x402_client, polymarket_market, polymarket_trade

# Create MCP server
server = Server("agent-trading")


@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools."""
    return [
        Tool(
            name="x402_list_services",
            description="List available x402 services. Returns services with pricing and payment requirements.",
            inputSchema={
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Optional search term to filter services",
                    },
                    "tag": {
                        "type": "string",
                        "description": "Optional tag to filter services",
                    },
                },
            },
        ),
        Tool(
            name="x402_execute_service",
            description="Execute an x402 service with payment. Automatically signs EIP-3009 authorization and settles payment on-chain.",
            inputSchema={
                "type": "object",
                "properties": {
                    "service_id": {
                        "type": "string",
                        "description": "The service ID to execute",
                    },
                },
                "required": ["service_id"],
            },
        ),
        Tool(
            name="polymarket_get_market",
            description="Get Polymarket market info by slug. Returns token IDs, prices, and market metadata.",
            inputSchema={
                "type": "object",
                "properties": {
                    "slug": {
                        "type": "string",
                        "description": "Market slug (e.g., 'will-bitcoin-reach-100k')",
                    },
                },
                "required": ["slug"],
            },
        ),
        Tool(
            name="polymarket_buy",
            description="Place a buy order on Polymarket. Limited to 10 shares maximum for safety.",
            inputSchema={
                "type": "object",
                "properties": {
                    "token_id": {
                        "type": "string",
                        "description": "The CLOB token ID to buy",
                    },
                    "size": {
                        "type": "number",
                        "description": "Number of shares to buy (max 10)",
                    },
                    "price": {
                        "type": "number",
                        "description": "Limit price (0-1)",
                    },
                    "tick_size": {
                        "type": "string",
                        "description": "Market tick size (default: 0.01)",
                    },
                    "neg_risk": {
                        "type": "boolean",
                        "description": "Whether market uses neg risk adapter",
                    },
                },
                "required": ["token_id", "size", "price"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls."""
    
    try:
        if name == "x402_list_services":
            result = await x402_client.list_services(
                search=arguments.get("search"),
                tag=arguments.get("tag"),
            )
        
        elif name == "x402_execute_service":
            result = await x402_client.execute_service(
                service_id=arguments["service_id"],
            )
        
        elif name == "polymarket_get_market":
            result = await polymarket_market.get_market_by_slug(
                slug=arguments["slug"],
            )
        
        elif name == "polymarket_buy":
            result = await polymarket_trade.market_buy(
                token_id=arguments["token_id"],
                size=arguments["size"],
                price=arguments["price"],
                tick_size=arguments.get("tick_size", "0.01"),
                neg_risk=arguments.get("neg_risk", False),
            )
        
        else:
            result = {"error": f"Unknown tool: {name}"}
        
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    
    except Exception as e:
        return [TextContent(type="text", text=json.dumps({"error": str(e)}))]


async def main():
    """Run MCP server."""
    from mcp.server.stdio import stdio_server
    
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="agent-trading",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=None,
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    asyncio.run(main())
