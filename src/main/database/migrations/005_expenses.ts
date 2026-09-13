import type { AppDatabase } from '../sqlite'

// Daily expenses captured by the project owner:
//  - `date`  : the business day the expense belongs to (YYYY-MM-DD).
//  - `name`  : the expense heading (e.g. "Travelling", "Loader"). The pair
//              (date, name) is unique, so re-saving the same expense on the
//              same day updates its price instead of creating a duplicate.
//  - `price` : amount in minor units (whole paisa), never negative.
// The dashboard expense list and the daily expenses page are both built from
// this single table.

export function up(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (date, name)
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  `)
}