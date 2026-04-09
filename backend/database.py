"""
Database configuration and connection management.
Uses SQLAlchemy with async SQLite for high-performance local database operations.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
import os
import sys
import logging
from datetime import date

logger = logging.getLogger(__name__)

def get_database_path():
    """
    Get the appropriate database path based on execution context.
    - For packaged app: Use user's home directory for persistent storage
    - For development: Use current directory
    """
    if getattr(sys, 'frozen', False):
        # Running as packaged app (PyInstaller)
        # Store DB in user's home directory to persist across app updates
        if sys.platform == 'darwin':  # macOS
            app_data = os.path.expanduser("~/Library/Application Support/TradingJournalPro")
        elif sys.platform == 'win32':  # Windows
            app_data = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'TradingJournalPro')
        else:  # Linux
            app_data = os.path.expanduser("~/.local/share/TradingJournalPro")
        
        # Create directory if it doesn't exist
        os.makedirs(app_data, exist_ok=True)
        return os.path.join(app_data, "trading_journal.db")
    else:
        # Development mode - use current directory
        return "./trading_journal.db"

DB_PATH = get_database_path()
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DB_PATH}")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
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


def check_db_integrity() -> bool:
    """
    Run SQLite PRAGMA integrity_check on the database file.
    If corruption is detected, renames the corrupt file and returns False
    so a fresh database can be created.
    Returns True if the database is healthy or doesn't exist yet.
    """
    db_file = os.path.abspath(DB_PATH)

    if not os.path.exists(db_file):
        return True  # No file yet — will be created by create_all

    import sqlite3
    try:
        conn = sqlite3.connect(db_file)
        result = conn.execute("PRAGMA integrity_check").fetchone()
        conn.close()

        if result and result[0] == "ok":
            return True

        # Corruption detected
        logger.error("Database integrity check FAILED: %s", result)
        corrupted_path = f"{db_file}.corrupted.{date.today().isoformat()}"
        os.rename(db_file, corrupted_path)
        logger.error("Corrupt database moved to: %s", corrupted_path)
        logger.error("A fresh database will be created.")
        return False

    except Exception as e:
        logger.error("Could not check database integrity: %s", e)
        # If we can't even open the file, it's likely corrupt
        try:
            corrupted_path = f"{db_file}.corrupted.{date.today().isoformat()}"
            os.rename(db_file, corrupted_path)
            logger.error("Potentially corrupt database moved to: %s", corrupted_path)
        except OSError:
            pass
        return False


async def init_db():
    """Initialize database tables and run versioned migrations."""
    from migrations import run_migrations

    # Check integrity before any SQLAlchemy operations
    is_healthy = check_db_integrity()
    if not is_healthy:
        print("⚠ Database corruption detected — corrupt file preserved, creating fresh database.")

    async with engine.begin() as conn:
        # Create all tables defined in SQLAlchemy models
        await conn.run_sync(Base.metadata.create_all)

        # Run any pending schema migrations
        applied = await conn.run_sync(run_migrations)
        if applied:
            print(f"Database initialized — {applied} migration(s) applied.")
        else:
            print("Database initialized — schema is up to date.")

