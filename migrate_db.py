import asyncio
from sqlalchemy import text
from backend.database import engine

async def migrate():
    async with engine.begin() as conn:
        try:
            print("Adding entry_time column to trades table...")
            await conn.execute(text("ALTER TABLE trades ADD COLUMN entry_time VARCHAR(8)"))
            print("Column added successfully.")
        except Exception as e:
            print(f"Migration failed (maybe entries already exist?): {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
