import asyncio
import httpx
import traceback

async def run_test():
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post('http://localhost:8000/api/sync', headers={'X-Account-ID': '80078659-1ad6-40ca-8084-51d5750ddf77'}, timeout=30.0)
            print("Status:", resp.status_code)
            print("Body:", resp.text)
        except Exception as e:
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_test())
