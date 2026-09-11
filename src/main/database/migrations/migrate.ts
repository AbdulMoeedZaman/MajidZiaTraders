import { runInTransaction, type AppDatabase } from '../sqlite'
import { up as initialSchema } from './001_initial_schema'
import { up as businessModules } from './002_business_modules'
import { up as completeBusinessSchema } from './003_complete_business_schema'
import { up as invoiceDiscountsAndIntegrity } from './004_invoice_discounts_payment_allocations_and_integrity'
import { up as ledgerSyncAndReversals } from './005_ledger_sync_allocation_repair_and_reversals'

interface Migration {
  version: number
  name: string
  up: (db: AppDatabase) => void
}

/*
 * Rules for migrations:
 * - Never edit a migration that may already have run on a user's machine; add a new one.
 * - Keep existing data and make each migration safe to run on any older database.
 * - Each migration runs inside its own transaction (see runMigrations). SQLite silently
 *   ignores `PRAGMA foreign_keys = OFF` inside a transaction, so for a table rebuild use
 *   `PRAGMA defer_foreign_keys = ON`, copy the rows, and check `PRAGMA foreign_key_check`
 *   is empty before the migration returns. Never drop a table that other tables reference
 *   without that check.
 */
const migrations: Migration[] = [
  { version: 1, name: '001_initial_schema', up: initialSchema },
  { version: 2, name: '002_business_modules', up: businessModules },
  { version: 3, name: '003_complete_business_schema', up: completeBusinessSchema },
  { version: 4, name: '004_invoice_discounts_payment_allocations_and_integrity', up: invoiceDiscountsAndIntegrity },
  { version: 5, name: '005_ledger_sync_allocation_repair_and_reversals', up: ledgerSyncAndReversals },
]

export const LATEST_MIGRATION_VERSION = migrations[migrations.length - 1].version

export function runMigrations(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      appliedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const applied = (
    db.prepare('SELECT version FROM _migrations').all() as { version: number }[]
  ).map((row) => row.version)

  for (const migration of migrations) {
    if (!applied.includes(migration.version)) {
      runInTransaction(db, () => {
        migration.up(db)
        db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(
          migration.version,
          migration.name
        )
      })
    }
  }
}
