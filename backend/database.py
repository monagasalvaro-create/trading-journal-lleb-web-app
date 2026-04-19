"""Database configuration: PostgreSQL-only async engine."""
import logging
import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)


def _require_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is required. Set it to a PostgreSQL URL, e.g.: "
            "postgresql+asyncpg://user:password@host:5432/trading_journal"
        )

    # Railway and some providers inject sync-style URLs. Normalize to the async driver.
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]

    if not url.startswith("postgresql+asyncpg://"):
        raise RuntimeError(
            "DATABASE_URL must be a PostgreSQL URL (postgresql:// or postgres:// accepted). "
            f"Got: {url[:30]}..."
        )

    return url


DATABASE_URL = _require_database_url()

engine = create_async_engine(DATABASE_URL, echo=False, future=True)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db():
    """Dependency injection for database sessions."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database tables and run versioned migrations."""
    from migrations import run_migrations

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        applied = await conn.run_sync(run_migrations)

    if applied:
        logger.info("Database initialized — %d migration(s) applied.", applied)
    else:
        logger.info("Database initialized — schema is up to date.")
