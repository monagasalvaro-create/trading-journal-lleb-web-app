"""
Versioned database migration system for Trading Journal Pro.

Each migration has a version number and a list of SQL statements.
The system tracks the current schema version in a dedicated table
and only runs migrations that haven't been applied yet.
"""
import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Increment SCHEMA_VERSION when adding new migrations.
SCHEMA_VERSION = 6

# Each migration is a tuple: (version, description, list_of_sql_statements)
# Migrations are applied in order. Each SQL statement is executed independently.
# Use column-existence checks for ADD COLUMN to remain idempotent.
MIGRATIONS = [
    (
        1,
        "Add settings and asset_board_items columns from initial release",
        [
            # Settings columns
            "ALTER TABLE settings ADD COLUMN ibkr_socket_port INTEGER DEFAULT 7497",
            "ALTER TABLE settings ADD COLUMN portfolio_stocks_pct REAL DEFAULT 70.0",
            "ALTER TABLE settings ADD COLUMN portfolio_options_pct REAL DEFAULT 30.0",
            # Asset board items columns
            "ALTER TABLE asset_board_items ADD COLUMN date DATE DEFAULT CURRENT_DATE",
            "ALTER TABLE asset_board_items ADD COLUMN invested_amount REAL",
            "ALTER TABLE asset_board_items ADD COLUMN net_pnl REAL",
            "ALTER TABLE asset_board_items ADD COLUMN is_closed BOOLEAN DEFAULT 0",
        ],
    ),
    (
        2,
        "Placeholder for future migrations",
        [
            # Add new SQL statements here when schema changes are needed.
            # Example:
            # "ALTER TABLE trades ADD COLUMN notes TEXT DEFAULT ''",
        ],
    ),
    (
        3,
        "Add last_sync_at to settings for accurate sync tracking",
        [
            "ALTER TABLE settings ADD COLUMN last_sync_at DATETIME",
        ],
    ),
    (
        4,
        "Add account_id for multi-account isolation; name existing default account",
        [
            # Add account_id to all data tables (default='default' preserves existing data)
            "ALTER TABLE trades ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default'",
            "ALTER TABLE account_equity ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default'",
            "ALTER TABLE asset_board_items ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default'",
            # Give the legacy 'default' settings row a display name
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
        "Fix UNIQUE constraint on account_equity.date for multi-account",
        [
            "CREATE TABLE account_equity_new ("
            "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "  account_id TEXT NOT NULL DEFAULT 'default',"
            "  date DATE NOT NULL,"
            "  total_equity REAL NOT NULL,"
            "  cash_balance REAL,"
            "  securities_value REAL,"
            "  unrealized_pnl REAL,"
            "  realized_pnl REAL,"
            "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            "  UNIQUE(account_id, date)"
            ");",
            "INSERT INTO account_equity_new (id, account_id, date, total_equity, cash_balance, securities_value, unrealized_pnl, realized_pnl, created_at) SELECT id, account_id, date, total_equity, cash_balance, securities_value, unrealized_pnl, realized_pnl, created_at FROM account_equity;",
            "DROP TABLE account_equity;",
            "ALTER TABLE account_equity_new RENAME TO account_equity;",
            "CREATE INDEX ix_account_equity_date ON account_equity (date);",
            "CREATE INDEX ix_account_equity_account_id ON account_equity (account_id);"
        ],
    ),
]


def _column_exists(connection, table_name: str, column_name: str) -> bool:
    """Check if a column already exists in a table (SQLite-specific)."""
    result = connection.execute(text(f"PRAGMA table_info({table_name})"))
    columns = [row[1] for row in result.fetchall()]
    return column_name in columns


def _get_current_version(connection) -> int:
    """Get the current schema version. Returns 0 if the table doesn't exist yet."""
    try:
        result = connection.execute(
            text("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
        )
        row = result.fetchone()
        return row[0] if row else 0
    except Exception:
        # Table doesn't exist yet
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

    This function is designed to be called via `conn.run_sync(run_migrations)`
    inside an async SQLAlchemy context.
    """
    _ensure_version_table(connection)
    current_version = _get_current_version(connection)

    applied = 0
    for version, description, statements in MIGRATIONS:
        if version <= current_version:
            continue

        logger.info("Applying migration v%d: %s", version, description)

        for sql in statements:
            # For ALTER TABLE ADD COLUMN, check if column already exists
            # to make migrations idempotent (safe to re-run).
            if "ADD COLUMN" in sql.upper():
                parts = sql.upper().split("ADD COLUMN")
                table_part = parts[0].replace("ALTER TABLE", "").strip()
                col_part = parts[1].strip().split()[0]
                if _column_exists(connection, table_part, col_part.lower()):
                    logger.debug("Column %s.%s already exists, skipping", table_part, col_part)
                    continue

            try:
                connection.execute(text(sql))
            except Exception as e:
                logger.warning("Migration v%d statement skipped (may already exist): %s", version, e)

        # Record the migration as applied
        connection.execute(
            text("INSERT OR REPLACE INTO schema_version (version, description) VALUES (:v, :d)"),
            {"v": version, "d": description},
        )
        applied += 1
        logger.info("Migration v%d applied successfully", version)

    if applied == 0:
        logger.debug("Database schema is up to date (v%d)", current_version)

    return applied
