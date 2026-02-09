
import asyncio
from mcp_server.tools import x402_client

async def test_execution():
    print("Listing services...")
    result = await x402_client.list_services()
    services = result.get('services', [])
    
    if not services:
        print("❌ No services found.")
        return

    # Pick the first service (Coca-cola...)
    target = services[0]
    print(f"Target Service: {target['name']} (ID: {target['id']})")
    print(f"Price: {target['price']['display']}")

    print("\nExecuting service...")
    try:
        exec_result = await x402_client.execute_service(target['id'])
        print("\n✅ Execution Result:")
        print(exec_result)
    except Exception as e:
        print(f"\n❌ Execution Failed: {e}")

if __name__ == '__main__':
    asyncio.run(test_execution())
