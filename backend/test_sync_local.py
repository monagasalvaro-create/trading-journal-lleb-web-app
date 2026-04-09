import asyncio
from database import async_session_maker
from routers.sync import sync_ibkr
from schemas import IBKRSyncRequest

async def main():
    async with async_session_maker() as db:
        try:
            req = IBKRSyncRequest(token=None, query_id=None)
            res = await sync_ibkr(request=req, x_account_id="80078659-1ad6-40ca-8084-51d5750ddf77", db=db)
            print(res)
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
