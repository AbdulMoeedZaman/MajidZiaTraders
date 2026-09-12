import type { AppDatabase } from '../sqlite'

// Adds display fields to the stock ledger created in 002:
//  - `date`  : the business date of the movement (invoice date for sales, the
//              current day for restocks) so ledger view and per-product history
//              render "2 AUG" style dates instead of the raw createdAt stamp.
//  - `price` : unit price (minor units) snapshot for movements that belong to a
//              sale, so the inventory view can show what an invoice line was billed at.
// Backfills existing rows from the creation timestamp; both columns are appended
// (SQLite ALTER ADD COLUMN) so the migration is safe on any older database.

export function up(db: AppDatabase): void {
  db.exec(`
    ALTER TABLE stock_movements ADD COLUMN date TEXT;
    ALTER TABLE stock_movements ADD COLUMN price INTEGER;

    UPDATE stock_movements SET date = substr(createdAt, 1, 10) WHERE date IS NULL;

    CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(referenceType, referenceId);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(date);
  `)
}