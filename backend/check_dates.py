import sqlite3

conn = sqlite3.connect('trading_journal.db')
cur = conn.cursor()

print("=== Last 10 NAV dates ===")
cur.execute('SELECT date, total_equity FROM account_equity ORDER BY date DESC LIMIT 10')
for row in cur.fetchall():
    print(f"  {row[0]}: ${row[1]:,.2f}")

print("\n=== Last 10 Trade exit dates ===")
cur.execute('SELECT exit_date, entry_date, ticker, net_pnl FROM trades ORDER BY COALESCE(exit_date, entry_date) DESC LIMIT 10')
for row in cur.fetchall():
    print(f"  exit:{row[0]} entry:{row[1]} {row[2]}: ${row[3]:,.2f}")

print("\n=== Trades in February 2026 ===")
cur.execute("SELECT COALESCE(exit_date, entry_date) as close_date, COUNT(*), SUM(net_pnl) FROM trades WHERE close_date LIKE '2026-02%' GROUP BY close_date ORDER BY close_date")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]} trades, ${row[2]:,.2f}")

conn.close()
