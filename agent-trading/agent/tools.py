"""
LangChain tool bindings for MCP tools.
"""

import asyncio
from typing import Optional, Type
from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from mcp_server.tools import x402_client, polymarket_market, polymarket_trade


class ListServicesInput(BaseModel):
    search: Optional[str] = Field(None, description="Search term to filter services")
    tag: Optional[str] = Field(None, description="Tag to filter services")


class ExecuteServiceInput(BaseModel):
    service_id: str = Field(..., description="The service ID to execute")


class GetMarketInput(BaseModel):
    slug: str = Field(..., description="Market slug (e.g., 'will-bitcoin-reach-100k')")


class MarketBuyInput(BaseModel):
    token_id: str = Field(..., description="The CLOB token ID to buy")
    size: float = Field(..., description="Number of shares to buy (max 10)")
    # Price removed to force Market Order



class X402ListServicesTool(BaseTool):
    name: str = "x402_list_services"
    description: str = "List available x402 services. Returns services with pricing and payment requirements."
    args_schema: Type[BaseModel] = ListServicesInput
    
    def _run(self, search: Optional[str] = None, tag: Optional[str] = None) -> str:
        return asyncio.run(self._arun(search, tag))
    
    async def _arun(self, search: Optional[str] = None, tag: Optional[str] = None) -> str:
        import json
        result = await x402_client.list_services(search=search, tag=tag)
        return json.dumps(result, indent=2)


class X402ExecuteServiceTool(BaseTool):
    name: str = "x402_execute_service"
    description: str = "Execute an x402 service with payment. Automatically signs and settles payment on-chain."
    args_schema: Type[BaseModel] = ExecuteServiceInput
    
    def _run(self, service_id: str) -> str:
        return asyncio.run(self._arun(service_id))
    
    async def _arun(self, service_id: str) -> str:
        import json
        result = await x402_client.execute_service(service_id=service_id)
        return json.dumps(result, indent=2)


class PolymarketGetMarketTool(BaseTool):
    name: str = "polymarket_get_market"
    description: str = "Get Polymarket market info by slug. Returns token IDs, prices, and market metadata."
    args_schema: Type[BaseModel] = GetMarketInput
    
    def _run(self, slug: str) -> str:
        return asyncio.run(self._arun(slug))
    
    async def _arun(self, slug: str) -> str:
        import json
        result = await polymarket_market.get_market_by_slug(slug=slug)
        return json.dumps(result, indent=2)


class PolymarketBuyTool(BaseTool):
    name: str = "polymarket_buy"
    description: str = "Place a buy order on Polymarket. Limited to 10 shares maximum for safety."
    args_schema: Type[BaseModel] = MarketBuyInput
    
    def _run(
        self,
        token_id: str,
        size: float,
    ) -> str:
        return asyncio.run(self._arun(token_id, size))
    
    async def _arun(
        self,
        token_id: str,
        size: float,
    ) -> str:
        import json
        # Implicitly use Market Order (price=None)
        result = await polymarket_trade.market_buy(
            token_id=token_id,
            size=size,
            price=None,
        )
        return json.dumps(result, indent=2)


def get_all_tools() -> list[BaseTool]:
    """Get all available tools for the agent."""
    return [
        X402ListServicesTool(),
        X402ExecuteServiceTool(),
        PolymarketGetMarketTool(),
        PolymarketBuyTool(),
    ]
