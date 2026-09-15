import { runInTransaction, type AppDatabase } from '../sqlite'
import { up as initialSchema } from './001_initial_schema'
import { up as futureExtensionPoints } from './002_future_extension_points'
import { up as routeCustomNames } from './003_route_custom_names'
import { up as stockMovementDisplayFields } from './004_stock_movement_display_fields'
import { up as expenses } from './005_expenses'
import { up as invoicePayments } from './006_invoice_payments'
import { up as actionLogs } from './007_action_logs'
import { up as actionLogActions } from './008_action_logger_actions'
import { up as dualUnitStock } from './009_dual_unit_stock'
import { up as productSalesPrice } from './010_product_sales_price'
import { up as customerProductPreferences } from './011_customer_product_preferences'

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
 *   is empty before the migration returns.
 *
 * Version tracking:
 * - `PRAGMA user_version` is the source of truth for the applied schema version.
 * - `_migrations` is kept as an audit journal (who applied what, when) and as a
 *   fallback for databases created before user_version tracking existed.
 * - The version stamp is written inside the same transaction as each migration, so a
 *   failed migration rolls back both the schema changes and the version bump — the
 *   database can never be left half-migrated.
 */
const migrations: Migration[] = [
  { version: 1, name: '001_initial_schema', up: initialSchema },
  { version: 2, name: '002_future_extension_points', up: futureExtensionPoints },
  { version: 3, name: '003_route_custom_names', up: routeCustomNames },
  { version: 4, name: '004_stock_movement_display_fields', up: stockMovementDisplayFields },
  { version: 5, name: '005_expenses', up: expenses },
  { version: 6, name: '006_invoice_payments', up: invoicePayments },
  { version: 7, name: '007_action_logs', up: actionLogs },
  { version: 8, name: '008_action_logger_actions', up: actionLogActions },
  { version: 9, name: '009_dual_unit_stock', up: dualUnitStock },
  { version: 10, name: '010_product_sales_price', up: productSalesPrice },
  { version: 11, name: '011_customer_product_preferences', up: customerProductPreferences },
]

export const LATEST_MIGRATION_VERSION = migrations[migrations.length - 1].version

function readUserVersion(db: AppDatabase): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
  const value = typeof row?.user_version === 'number' ? row.user_version : 0
  return value > 0 ? value : 0
}

function readJournalVersions(db: AppDatabase): Set<number> {
  return new Set(
    (db.prepare('SELECT version FROM _migrations').all() as { version: number }[]).map(
      (row) => row.version
    )
  )
}

/** Highest schema version recorded anywhere for this database (user_version or journal). */
export function readSchemaVersion(db: AppDatabase): number {
  const userVersion = readUserVersion(db)
  const journalVersions = readJournalVersions(db)
  return Math.max(userVersion, ...[...journalVersions])
}

export function runMigrations(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      appliedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const journal = readJournalVersions(db)
  const userVersion = readUserVersion(db)

  // A migration is already applied if the journal records it OR its version is at or
  // below user_version. user_version wins for databases that were never journaled.
  let current = Math.max(userVersion, ...[...journal])

  for (const migration of migrations) {
    if (migration.version <= current) continue
    runInTransaction(db, () => {
      migration.up(db)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name
      )
      db.exec(`PRAGMA user_version = ${migration.version}`)
    })
    current = migration.version
  }

  // Backfill: databases migrated before version tracking have a full journal but an
  // unstamped header. Write the effective version so user_version is always accurate.
  if (readUserVersion(db) !== current) {
    db.exec(`PRAGMA user_version = ${current}`)
  }
}