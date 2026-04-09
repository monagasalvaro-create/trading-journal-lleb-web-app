import sqlite3
conn = sqlite3.connect('trading_journal.db')
print(conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='account_equity'").fetchone()[0])
