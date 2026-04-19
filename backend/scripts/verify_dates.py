import sqlite3
import datetime

def check_db():
    try:
        conn = sqlite3.connect('trading_journal.db')
        c = conn.cursor()
        
        print("\n=== LATEST TRADES ===")
        # Get last 5 trades
        c.execute("SELECT ticker, entry_date, net_pnl FROM trades ORDER BY entry_date DESC, created_at DESC LIMIT 5")
        rows = c.fetchall()
        for r in rows:
            print(f"Trade: {r[1]} | {r[0]} | ${r[2]}")
            
        print("\n=== LATEST EQUITY (NAV) ===")
        # Get last 5 NAV records
        c.execute("SELECT date, total_equity FROM account_equity ORDER BY date DESC LIMIT 5")
        rows = c.fetchall()
        for r in rows:
            print(f"NAV:   {r[0]} | ${r[1]}")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
