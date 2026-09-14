import type { AppDatabase } from '../sqlite'

// Widens the action_logs CHECK constraint with the two new correction actions
// (payment_reversed, stock_adjusted) introduced by the adjustments screen.
// SQLite cannot alter a CHECK constraint, so the table is rebuilt inside the
// migration's transaction: rows are copied into a fresh table with the broader
// constraint and the old table is dropped. action_logs has no FKs referencing
// it, so `defer_foreign_keys` is only a safety net; a foreign_key_check that is
// not empty aborts the migration.

export function up(db: AppDatabase): void {
  db.exec(`
    PRAGMA defer_foreign_keys = ON;

    ALTER TABLE action_logs RENAME TO action_logs_old;

    CREATE TABLE action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seq INTEGER NOT NULL UNIQUE,
      action TEXT NOT NULL
        CHECK (action IN ('product_created', 'restocked', 'payment_recorded', 'payment_reversed', 'stock_adjusted', 'invoice_created')),
      targetType TEXT NOT NULL,
      targetId INTEGER,
      summary TEXT NOT NULL,
      snapshot TEXT,
      status TEXT NOT NULL DEFAULT 'applied'
        CHECK (status IN ('applied', 'undone', 'superseded')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO action_logs (id, seq, action, targetType, targetId, summary, snapshot, status, createdAt)
      SELECT id, seq, action, targetType, targetId, summary, snapshot, status, createdAt
      FROM action_logs_old;

    DROP TABLE action_logs_old;

    CREATE INDEX IF NOT EXISTS idx_action_logs_status ON action_logs(status, seq);
  `)

  const violations = db.prepare('PRAGMA foreign_key_check').all()
  if (violations.length > 0) {
    throw new Error('action_logs rebuild failed the foreign key check')
  }
}