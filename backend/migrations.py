"""
Versioned database migration system for Trading Journal Pro (PostgreSQL-only).

Each migration has a version number and a list of SQL statements.
The system tracks the current schema version in a dedicated table
and only runs migrations that haven't been applied yet.

Statements are wrapped in per-statement savepoints so a "duplicate object"
error on an idempotent re-run doesn't abort the outer transaction (Postgres-strict).
"""
import logging
import re

from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)

# Increment SCHEMA_VERSION when adding new migrations.
SCHEMA_VERSION = 7

# Each migration is a tuple: (version, description, list_of_sql_statements)
# Migrations are applied in order. Each SQL statement is executed inside its own savepoint.
MIGRATIONS = [
    (
        1,
        "Add settings and asset_board_items columns from initial release",
        [
            "ALTER TABLE settings ADD COLUMN ibkr_socket_port INTEGER DEFAULT 7497",
            "ALTER TABLE settings ADD COLUMN portfolio_stocks_pct REAL DEFAULT 70.0",
            "ALTER TABLE settings ADD COLUMN portfolio_options_pct REAL DEFAULT 30.0",
            "ALTER TABLE asset_board_items ADD COLUMN date DATE DEFAULT CURRENT_DATE",
            "ALTER TABLE asset_board_items ADD COLUMN invested_amount REAL",
            "ALTER TABLE asset_board_items ADD COLUMN net_pnl REAL",
            "ALTER TABLE asset_board_items ADD COLUMN is_closed BOOLEAN DEFAULT FALSE",
        ],
    ),
    (
        2,
        "Placeholder for future migrations",
        [],
    ),
    (
        3,
        "Add last_sync_at to settings for accurate sync tracking",
        [
            "ALTER TABLE settings ADD COLUMN last_sync_at TIMESTAMP",
        ],
    ),
    (
        4,
        "Add account_id for multi-account isolation; name existing default account",
        [
            "ALTER TABLE trades ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default'",
            "ALTER TABLE account_equity ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default'",
            "ALTER TABLE asset_board_items ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default'",
            "UPDATE settings SET account_name = 'Account 1' WHERE id = 'default' AND (account_name IS NULL OR account_name = '')",
        ],
    ),
    (
        5,
        "Add has_stop to asset_board_items to track missing stop orders",
        [
            "ALTER TABLE asset_board_items ADD COLUMN has_stop BOOLEAN",
        ],
    ),
    (
        6,
        "Ensure UNIQUE(account_id, date) on account_equity",
        [
            # Drop legacy UNIQUE(date) constraint from SQLite-era schema if present.
            "ALTER TABLE account_equity DROP CONSTRAINT IF EXISTS account_equity_date_key",
            # Add composite UNIQUE. If it already exists (e.g. from create_all or re-run),
            # the per-statement savepoint swallows the duplicate_object error.
            "ALTER TABLE account_equity ADD CONSTRAINT account_equity_account_id_date_key UNIQUE (account_id, date)",
            # Indexes — idempotent via IF NOT EXISTS.
            "CREATE INDEX IF NOT EXISTS ix_account_equity_date ON account_equity (date)",
            "CREATE INDEX IF NOT EXISTS ix_account_equity_account_id ON account_equity (account_id)",
        ],
    ),
    (
        7,
        "Add user_id to all tables for multi-user isolation (default='system' preserves existing data)",
        [
            "ALTER TABLE trades ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT 'system'",
            "ALTER TABLE settings ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT 'system'",
            "ALTER TABLE account_equity ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT 'system'",
            "ALTER TABLE asset_board_items ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT 'system'",
            "ALTER TABLE board_notes ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT 'system'",
        ],
    ),
]


def _parse_add_column(sql: str) -> tuple[str, str] | None:
    """Extract (table_name, column_name) from an ALTER TABLE ... ADD COLUMN ... statement."""
    match = re.match(
        r"\s*alter\s+table\s+(\S+)\s+add\s+column\s+(\S+)",
        sql,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return match.group(1), match.group(2)


def _column_exists(connection, table_name: str, column_name: str) -> bool:
    """Return True if `column_name` exists in `table_name`. Dialect-agnostic via SQLAlchemy inspect."""
    try:
        inspector = inspect(connection)
        existing = {c["name"].lower() for c in inspector.get_columns(table_name)}
        return column_name.lower() in existing
    except Exception:
        return False


def _get_current_version(connection) -> int:
    """Get the current schema version. Returns 0 if the table doesn't exist yet."""
    try:
        result = connection.execute(
            text("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
        )
        row = result.fetchone()
        return row[0] if row else 0
    except Exception:
        return 0


def _ensure_version_table(connection):
    """Create the schema_version table if it doesn't exist."""
    connection.execute(text(
        "CREATE TABLE IF NOT EXISTS schema_version ("
        "  version INTEGER PRIMARY KEY,"
        "  description TEXT,"
        "  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ")"
    ))


def run_migrations(connection) -> int:
    """
    Run all pending migrations synchronously within a connection.
    Returns the number of migrations applied.

    Designed to be called via `conn.run_sync(run_migrations)` inside an async
    SQLAlchemy context. Uses per-statement savepoints so duplicate-object errors
    on idempotent re-runs don't abort the outer transaction.
    """
    _ensure_version_table(connection)
    current_version = _get_current_version(connection)

    applied = 0
    for version, description, statements in MIGRATIONS:
        if version <= current_version:
            continue

        logger.info("Applying migration v%d: %s", version, description)

        for sql in statements:
            # Skip ADD COLUMN early if the column is already present (common when
            # create_all has built the latest schema and older migrations are replayed).
            parsed = _parse_add_column(sql)
            if parsed is not None:
                table, column = parsed
                if _column_exists(connection, table, column):
                    logger.debug("Column %s.%s already exists, skipping", table, column)
                    continue

            try:
                with connection.begin_nested():
                    connection.execute(text(sql))
            except Exception as e:
                # Savepoint is already rolled back by begin_nested's context manager.
                logger.warning(
                    "Migration v%d statement skipped (likely already applied): %s",
                    version, e,
                )

        # Record the migration as applied. Idempotent via ON CONFLICT.
        connection.execute(
            text(
                "INSERT INTO schema_version (version, description) VALUES (:v, :d) "
                "ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description"
            ),
            {"v": version, "d": description},
        )
        applied += 1
        logger.info("Migration v%d applied successfully", version)

    if applied == 0:
        logger.debug("Database schema is up to date (v%d)", current_version)

    return applied
