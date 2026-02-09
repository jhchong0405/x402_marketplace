"""
x402 Market Client

MCP tool for accessing x402-market services with payment.
"""

import os
import json
import httpx
from typing import Optional
from eth_account import Account
from eth_account.messages import encode_typed_data
from dotenv import load_dotenv

load_dotenv()

X402_MARKET_URL = os.getenv("X402_MARKET_URL", "http://localhost:3000")
CLIENT_PRIVATE_KEY = os.getenv("CLIENT_PRIVATE_KEY", "")
MOCK_USDC_ADDRESS = os.getenv("MOCK_USDC_ADDRESS", "0x865310dc9D0bFE1460caB221B4bF3DA2040b94D7")
ESCROW_ADDRESS = os.getenv("ESCROW_ADDRESS", "0x8d4712191fa0a189ab95C58aBaF6E19EBEA74c7f")

# EIP-712 domain for Conflux eSpace Testnet
DOMAIN = {
    "name": "Mock USD Coin",
    "version": "1",
    "chainId": 71,
    "verifyingContract": MOCK_USDC_ADDRESS,
}

TRANSFER_WITH_AUTH_TYPES = {
    "ReceiveWithAuthorization": [
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
        {"name": "nonce", "type": "bytes32"},
    ]
}


def get_wallet_address() -> str:
    """Get wallet address from private key."""
    if not CLIENT_PRIVATE_KEY:
        return ""
    account = Account.from_key(CLIENT_PRIVATE_KEY)
    return account.address


def sign_eip3009_transfer(
    to: str,
    value: int,
    valid_after: int = 0,
    valid_before: int = 0,
    nonce: Optional[bytes] = None,
) -> dict:
    """
    Sign an EIP-3009 TransferWithAuthorization message.
    
    Returns the signature data needed for x402 payment.
    """
    if not CLIENT_PRIVATE_KEY:
        raise ValueError("CLIENT_PRIVATE_KEY not configured")
    
    account = Account.from_key(CLIENT_PRIVATE_KEY)
    
    # Generate random nonce if not provided
    if nonce is None:
        nonce = os.urandom(32)
    
    # Default valid_before to far future if not set
    if valid_before == 0:
        valid_before = 2**256 - 1
    
    message = {
        "from": account.address,
        "to": to,
        "value": value,
        "validAfter": valid_after,
        "validBefore": valid_before,
        "nonce": nonce,
    }
    
    # Sign typed data (EIP-712)
    typed_data = {
        "types": TRANSFER_WITH_AUTH_TYPES,
        "primaryType": "ReceiveWithAuthorization",
        "domain": DOMAIN,
        "message": message,
    }
    
    signed = account.sign_typed_data(full_message=typed_data)
    
    return {
        "from": account.address,
        "to": to,
        "value": str(value),
        "validAfter": str(valid_after),
        "validBefore": str(valid_before),
        "nonce": "0x" + nonce.hex(),
        "v": signed.v,
        "r": hex(signed.r),
        "s": hex(signed.s),
    }


async def list_services(search: Optional[str] = None, tag: Optional[str] = None) -> dict:
    """
    Get list of available services from x402-market.
    
    Args:
        search: Optional search term
        tag: Optional tag filter
        
    Returns:
        Dict with services list and metadata
    """
    params = {}
    if search:
        params["search"] = search
    if tag:
        params["tag"] = tag
    
    async with httpx.AsyncClient() as client:
        print(f"[Agent] 🔍 Searching x402 services... (Search: '{search}', Tag: '{tag}')")
        response = await client.get(
            f"{X402_MARKET_URL}/api/agent/services",
            params=params,
            timeout=30.0,
            follow_redirects=True,
        )
        response.raise_for_status()
        data = response.json()
        count = len(data) if isinstance(data, list) else len(data.get("services", []))
        print(f"[Agent] ✅ Found {count} services.")
        return data


async def get_service_details(service_id: str) -> dict:
    """
    Get detailed info about a specific service.
    
    Args:
        service_id: The service ID
        
    Returns:
        Service details including payment requirements
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{X402_MARKET_URL}/api/agent/services/{service_id}",
            timeout=30.0,
            follow_redirects=True,
        )
        response.raise_for_status()
        return response.json()


async def execute_service(service_id: str, request_body: Optional[dict] = None) -> dict:
    """
    Execute a service with x402 payment.
    
    1. Gets service details to determine price
    2. Signs EIP-3009 authorization
    3. Submits to /api/agent/execute
    
    Args:
        service_id: The service ID to execute
        request_body: Optional request body to pass to the service
        
    Returns:
        Service response with payment confirmation
    """
    # Get service details first
    print(f"[Agent] ℹ️  Fetching details for service: {service_id}")
    details_response = await get_service_details(service_id)
    service = details_response.get("service", {})
    
    # Extract payment requirements
    payment_req = service.get("paymentRequirements", {})
    amount = int(payment_req.get("maxAmountRequired", "0"))
    pay_to = payment_req.get("payTo", ESCROW_ADDRESS)
    
    if amount == 0:
        raise ValueError("Could not determine payment amount")
    
    print(f"[Agent] 💰 Payment required: {amount/1e18} mUSDC")
    
    # Sign the payment authorization
    print(f"[Agent] ✍️  Signing EIP-3009 payment authorization...")
    signature = sign_eip3009_transfer(to=pay_to, value=amount)
    
    # Execute the service
    wallet_address = get_wallet_address()
    
    payload = {
        "serviceId": service_id,
        "walletAddress": wallet_address,
        "signature": signature,
        "requestBody": request_body or {},
    }
    
    print(f"[Agent] 🚀 Submitting payment and executing service...")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{X402_MARKET_URL}/api/agent/execute",
            json=payload,
            timeout=120.0,
            follow_redirects=True,
        )
        if response.status_code >= 400:
            print(f"[Agent] ❌ Error {response.status_code}: {response.text}")
        response.raise_for_status()
        result = response.json()
        tx_hash = result.get("payment", {}).get("txHash")
        if tx_hash:
            print(f"[Agent] 🔗 Transaction Hash: {tx_hash}")
        print(f"[Agent] ✅ Service executed successfully! Content received.")
        return result


# CLI for testing
if __name__ == "__main__":
    import asyncio
    import argparse
    
    parser = argparse.ArgumentParser(description="x402 Market Client")
    parser.add_argument("--list", action="store_true", help="List available services")
    parser.add_argument("--search", type=str, help="Search term")
    parser.add_argument("--execute", type=str, help="Execute service by ID")
    args = parser.parse_args()
    
    async def main():
        if args.list or args.search:
            result = await list_services(search=args.search)
            print(json.dumps(result, indent=2))
        elif args.execute:
            result = await execute_service(args.execute)
            print(json.dumps(result, indent=2))
        else:
            # Default: list services
            result = await list_services()
            print(json.dumps(result, indent=2))
    
    asyncio.run(main())
