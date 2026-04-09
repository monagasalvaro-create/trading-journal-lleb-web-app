import httpx
import asyncio

async def check_api():
    try:
        async with httpx.AsyncClient() as client:
            # Test NAV history endpoint
            response = await client.get("http://localhost:8000/api/metrics/nav-history", timeout=5.0)
            data = response.json()
            
            print("=== NAV History from API ===")
            if "data" in data and data["data"]:
                nav_list = data["data"]
                print(f"Total records returned: {len(nav_list)}")
                print("\nLast 7 records:")
                for record in nav_list[-7:]:
                    print(f"  {record['date']}: ${record['total_equity']:,.2f}")
            else:
                print("No data returned!")
                print(f"Response: {data}")
                
    except Exception as e:
        print(f"Error connecting to API: {e}")
        print("Is the backend server running?")

asyncio.run(check_api())
