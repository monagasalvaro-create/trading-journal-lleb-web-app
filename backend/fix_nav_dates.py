"""
Script to fix existing NAV dates in the database.
IBKR Flex Reports use market close date, but IBKR mobile app shows +1 day.
This script adds 1 day to all existing NAV dates to match IBKR mobile convention.

To avoid UNIQUE constraint errors, we process records from newest to oldest.
"""
import sqlite3
from datetime import datetime, timedelta

def migrate_nav_dates():
    conn = sqlite3.connect('trading_journal.db')
    cur = conn.cursor()
    
    # Get all NAV records - ORDER BY date DESC to process newest first
    # This avoids collisions when adding +1 day
    cur.execute('SELECT id, date FROM account_equity ORDER BY date DESC')
    records = cur.fetchall()
    
    print(f"Found {len(records)} NAV records to update")
    print("Processing from newest to oldest to avoid collisions...")
    
    updated = 0
    skipped = 0
    
    for record_id, date_str in records:
        # Parse the date
        old_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        # Add 1 day
        new_date = old_date + timedelta(days=1)
        
        try:
            # Update the record
            cur.execute('UPDATE account_equity SET date = ? WHERE id = ?', 
                        (new_date.isoformat(), record_id))
            updated += 1
        except sqlite3.IntegrityError:
            # Date already exists (duplicate), skip this record
            print(f"  Skipping {date_str} -> {new_date.isoformat()} (duplicate)")
            skipped += 1
    
    conn.commit()
    
    print(f"\nUpdated: {updated}, Skipped: {skipped}")
    
    # Verify the update
    cur.execute('SELECT date, total_equity FROM account_equity ORDER BY date DESC LIMIT 5')
    print("\nUpdated NAV dates (last 5):")
    for row in cur.fetchall():
        print(f"  {row[0]}: ${row[1]:,.2f}")
    
    conn.close()
    print("\n✅ Migration complete!")

if __name__ == "__main__":
    migrate_nav_dates()
