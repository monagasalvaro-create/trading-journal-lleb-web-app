import sqlite3

def check_specific_trades():
    conn = sqlite3.connect('trading_journal.db')
    cursor = conn.cursor()
    
    print("Checking specific SPY trades for 2026-01-20...")
    cursor.execute("""
        SELECT ticker, net_pnl 
        FROM trades 
        WHERE entry_date = '2026-01-20' AND ticker LIKE 'SPY%'
        ORDER BY ticker
    """)
    
    trades = cursor.fetchall()
    for t in trades:
        ticker = t[0]
        net_pnl = t[1]
        
        # Extract strike from ticker (e.g., SPY 260121P00669000 -> 669)
        # Ticker format: SYMBOL YYMMDD[C/P]STRIKE
        # SPY   260121P00669000
        # 012345678901234567890
        try:
            strike_part = ticker.split('P')[-1] if 'P' in ticker else ticker.split('C')[-1]
            strike = int(strike_part) / 1000
        except:
            strike = 0
            
        print(f"Strike {strike}: ${net_pnl:.2f}")

if __name__ == "__main__":
    check_specific_trades()
