import asyncio
import os
import json
import httpx
from eth_account import Account
from eth_account.messages import encode_typed_data
from dotenv import load_dotenv

# Load env
load_dotenv()

# Config
X402_MARKET_URL = os.getenv("X402_MARKET_URL", "http://localhost:3000")
PRIVATE_KEY = os.getenv("CLIENT_PRIVATE_KEY")
CHAIN_ID = 1030  # Conflux eSpace
USDC_ADDRESS = "0x0000000000000000000000000000000000000000"  # Mock for now if not in env
ESCROW_ADDRESS = "0x0000000000000000000000000000000000000000"

if not PRIVATE_KEY:
    print("❌ Error: CLIENT_PRIVATE_KEY not found in env")
    exit(1)

account = Account.from_key(PRIVATE_KEY)
print(f"🔑 Using wallet: {account.address}")
print(f"🌐 Target URL: {X402_MARKET_URL}")

async def test_payment_flow():
    async with httpx.AsyncClient() as client:
        # 1. List services to get a real one
        print("\n[1] Listing services...")
        try:
            resp = await client.get(f"{X402_MARKET_URL}/api/agent/services", timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            services = data.get("services", []) if isinstance(data, dict) else data
            
            if not services:
                print("❌ No services found to test with.")
                return
                
            # Pick first service
            target_service = services[0]
            service_id = target_service["id"]
            title = target_service.get("title", "Unknown")
            print(f"✅ Found service: {title} (ID: {service_id})")
            
            # 2. Get details
            print(f"\n[2] Getting details for {service_id}...")
            resp = await client.get(f"{X402_MARKET_URL}/api/agent/services/{service_id}", timeout=10.0)
            resp.raise_for_status()
            service_data = resp.json().get("service", {})
            
            payment_req = service_data.get("paymentRequirements", {})
            amount = int(payment_req.get("maxAmountRequired", "0"))
            pay_to = payment_req.get("payTo")
            token = payment_req.get("token")
            
            print(f"💰 Payment Required: {amount} wei")
            print(f"👉 Pay To: {pay_to}")
            print(f"🪙 Token: {token}")

            if amount == 0:
                print("⚠️  No payment required for this service. Skipping signature test.")
                return

            # 3. Sign EIP-3009
            print("\n[3] Signing EIP-3009 Transfer...")
            
            # Fallback for Conflux eSpace valid CUSD if token is missing
            if not token:
                token = "0x865310dc9D0bFE1460caB221B4bF3DA2040b94D7"
                print(f"⚠️  Token was None, utilizing env Mock USDC: {token}")

            # EIP-712 Domain
            domain_data = {
                "name": "USD Coin",
                "version": "2",
                "chainId": CHAIN_ID,
                "verifyingContract": token
            }
            
            import time
            import secrets
            
            nonce = secrets.token_hex(32)
            valid_after = 0
            valid_before = int(time.time()) + 3600
            
            message = {
                "from": account.address,
                "to": pay_to,
                "value": amount,
                "validAfter": valid_after,
                "validBefore": valid_before,
                "nonce": f"0x{nonce}"
            }
            
            print(f"📝 Message: {json.dumps(message, indent=2)}")

            # Message structure for encode_typed_data
            full_data = {
                "types": {
                    "EIP712Domain": [
                        {"name": "name", "type": "string"},
                        {"name": "version", "type": "string"},
                        {"name": "chainId", "type": "uint256"},
                        {"name": "verifyingContract", "type": "address"},
                    ],
                    "TransferWithAuthorization": [
                        {"name": "from", "type": "address"},
                        {"name": "to", "type": "address"},
                        {"name": "value", "type": "uint256"},
                        {"name": "validAfter", "type": "uint256"},
                        {"name": "validBefore", "type": "uint256"},
                        {"name": "nonce", "type": "bytes32"},
                    ]
                },
                "primaryType": "TransferWithAuthorization",
                "domain": domain_data,
                "message": message
            }
            
            # Sign using structured data
            signed = account.sign_message(encode_typed_data(full_message=full_data))
            signature = signed.signature.hex()
            
            print(f"✍️  Signature: 0x{signature}")
            
            # 4. Execute
            print("\n[4] Sending Execution Request...")
            
            payload = {
                "serviceId": service_id,
                "walletAddress": account.address,
                "signature": f"0x{signature}",
                "requestBody": {}
            }
            
            execute_resp = await client.post(
                f"{X402_MARKET_URL}/api/agent/execute",
                json=payload,
                timeout=30.0
            )
            
            print(f"📥 Response Status: {execute_resp.status_code}")
            print(f"📥 Response Body: {execute_resp.text}")
            
            if execute_resp.is_error:
                print("❌ Execution failed!")
            else:
                print("✅ Execution successful!")

        except Exception as e:
            print(f"❌ Error during test: {str(e)}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_payment_flow())
