import sqlite3
conn = sqlite3.connect('trading_journal.db')
cur = conn.execute('SELECT ticker, net_pnl FROM trades WHERE entry_date = "2026-01-20" ORDER BY net_pnl DESC')
trades = cur.fetchall()
print(f'Total trades Jan 20: {len(trades)}')
for t in trades:
    print(f"{t[0]}: {t[1]:.2f}")
