import sqlite3

def check_trades():
    conn = sqlite3.connect('trading_journal.db')
    cursor = conn.cursor()
    
    print("Checking trades for 2026-01-20...")
    cursor.execute("""
        SELECT ticker, net_pnl, commissions, quantity, entry_price 
        FROM trades 
        WHERE entry_date = '2026-01-20' 
        ORDER BY ticker
    """)
    
    trades = cursor.fetchall()
    print(f"Total trades found: {len(trades)}")
    print("-" * 80)
    print(f"{'Ticker':<30} | {'Net P&L':>10} | {'Comm':>8} | {'Qty':>5} | {'Price':>8}")
    print("-" * 80)
    
    for t in trades:
        ticker = t[0]
        net_pnl = t[1]
        comm = t[2]
        qty = t[3]
        price = t[4]
        print(f"{ticker:<30} | {net_pnl:>10.2f} | {comm:>8.2f} | {qty:>5.0f} | {price:>8.4f}")

if __name__ == "__main__":
    check_trades()
