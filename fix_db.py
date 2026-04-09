import sqlite3
import os

DB_PATH = os.path.join("backend", "trading_journal.db")

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        return

    print(f"Migrating database at {DB_PATH}...")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if column exists
        cursor.execute("PRAGMA table_info(trades)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "entry_time" in columns:
            print("Column 'entry_time' already exists.")
        else:
            print("Adding 'entry_time' column...")
            cursor.execute("ALTER TABLE trades ADD COLUMN entry_time VARCHAR(8)")
            conn.commit()
            print("Success.")
            
        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
