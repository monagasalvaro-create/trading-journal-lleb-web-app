
import sqlite3
import os
import sys

def migrate_db(db_path):
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}, skipping.")
        return

    print(f"Migrating database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Create board_notes table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS board_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_type VARCHAR(20) NOT NULL,
            date DATE NOT NULL,
            content VARCHAR DEFAULT "",
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        # Create index on date
        cursor.execute("""
        CREATE INDEX IF NOT EXISTS ix_board_notes_date ON board_notes (date);
        """)

        conn.commit()
        print("Migration successful: 'board_notes' table created.")
            
    except Exception as e:
        print(f"Error migrating {db_path}: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    # 1. Migrate Development DB (if exists)
    dev_db = os.path.join(os.getcwd(), "trading_journal.db")
    migrate_db(dev_db)

    # 2. Migrate Production/App DB (Mac)
    prod_db = os.path.expanduser("~/Library/Application Support/TradingJournalPro/trading_journal.db")
    migrate_db(prod_db)
