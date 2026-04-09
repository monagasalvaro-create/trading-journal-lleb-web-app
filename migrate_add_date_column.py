
import sqlite3
import os
import sys
from datetime import date

def migrate_db(db_path):
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}, skipping.")
        return

    print(f"Migrating database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(asset_board_items)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'date' in columns:
            print("Column 'date' already exists.")
        else:
            print("Adding 'date' column...")
            cursor.execute("ALTER TABLE asset_board_items ADD COLUMN date DATE")
            
            # Update existing records to today's date
            today = date.today().isoformat()
            cursor.execute("UPDATE asset_board_items SET date = ?", (today,))
            conn.commit()
            print("Migration successful: 'date' column added and populated.")
            
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
