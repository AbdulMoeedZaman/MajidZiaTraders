import path from 'path'
import { describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase } from '../../src/main/database/connection'
import { AppDatabase, runInTransaction } from '../../src/main/database/sqlite'
import {
  LATEST_MIGRATION_VERSION,
  readSchemaVersion,
  runMigrations,
} from '../../src/main/database/migrations/migrate'
import { up as initialSchema } from '../../src/main/database/migrations/001_initial_schema'
import { useTestDatabase } from './helpers'

describe('schema migrations (PRAGMA user_version)', () => {
  useTestDatabase()

  const readUserVersion = (db: AppDatabase): number => {
    const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
    return row.user_version
  }

  it('fresh startup applies every migration and stamps PRAGMA user_version', () => {
    const db = getDatabase()
    expect(readUserVersion(db)).toBe(LATEST_MIGRATION_VERSION)
    expect(readSchemaVersion(db)).toBe(LATEST_MIGRATION_VERSION)
  })

  it('re-running the migration runner is a no-op', () => {
    getDatabase()
    runMigrations(getDatabase())
    expect(readUserVersion(getDatabase())).toBe(LATEST_MIGRATION_VERSION)
    const count = getDatabase().prepare('SELECT COUNT(*) AS c FROM _migrations').get() as {
      c: number
    }
    expect(count.c).toBe(LATEST_MIGRATION_VERSION)
  })

  it('applies the missing forward migrations when user_version is behind (old install)', () => {
    // Build a genuine version-1 database: only the initial schema exists.
    const oldDb = new AppDatabase(path.join(process.env.TEST_USER_DATA!, 'old-install.db'))
    initialSchema(oldDb)
    oldDb.exec(
      `CREATE TABLE _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        appliedAt TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    oldDb.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(1, '001_initial_schema')
    oldDb.exec('PRAGMA user_version = 1')
    expect(readUserVersion(oldDb)).toBe(1)

    runMigrations(oldDb)

    expect(readUserVersion(oldDb)).toBe(LATEST_MIGRATION_VERSION)
    const versions = (
      oldDb.prepare('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[]
    ).map((row) => row.version)
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    // end state of the later migrations is present
    const routeCols = (
      oldDb.prepare('PRAGMA table_info(routes)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(routeCols).toContain('day')
    const stockCols = (
      oldDb.prepare('PRAGMA table_info(stock_movements)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(stockCols).toContain('date')
    expect(stockCols).toContain('price')
    expect(stockCols).toContain('newCartons')
    expect(stockCols).toContain('newLoosePieces')
    const invoiceCols = (
      oldDb.prepare('PRAGMA table_info(invoices)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(invoiceCols).toContain('status')
    expect(invoiceCols).toContain('paidAmount')
    const productCols = (
      oldDb.prepare('PRAGMA table_info(products)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(productCols).toContain('piecesPerCarton')
    expect(productCols).not.toContain('boxesPerCarton')
    expect(productCols).toContain('salesPrice')
    const prefCols = (
      oldDb.prepare('PRAGMA table_info(customer_product_preferences)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(prefCols).toEqual(
      expect.arrayContaining(['customerId', 'productId', 'preferencePrice', 'createdAt', 'updatedAt'])
    )
    const itemCols = (
      oldDb.prepare('PRAGMA table_info(invoice_items)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(itemCols).toContain('piecesPerCarton')
    expect(itemCols).not.toContain('boxesPerCarton')
    const historyCols = (
      oldDb.prepare('PRAGMA table_info(action_logs)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(historyCols).toContain('seq')
    expect(historyCols).toContain('snapshot')
    expect(historyCols).toContain('status')
    oldDb.close()
  })

  it('backfills user_version when only the journal is ahead (never re-applies)', () => {
    getDatabase()
    // Pretend the version stamp was lost while the journal stayed intact.
    getDatabase().exec('PRAGMA user_version = 2')
    expect(readUserVersion(getDatabase())).toBe(2)
    const before = getDatabase().prepare('SELECT COUNT(*) AS c FROM _migrations').get() as {
      c: number
    }

    runMigrations(getDatabase())

    expect(readUserVersion(getDatabase())).toBe(LATEST_MIGRATION_VERSION)
    const after = getDatabase().prepare('SELECT COUNT(*) AS c FROM _migrations').get() as {
      c: number
    }
    expect(after.c).toBe(before.c)
  })

  it('a failing migration batch rolls back the schema change AND the version stamp', () => {
    const db = new AppDatabase(path.join(process.env.TEST_USER_DATA!, 'rollback.db'))
    db.exec('PRAGMA user_version = 0')
    expect(readUserVersion(db)).toBe(0)

    expect(() =>
      runInTransaction(db, () => {
        db.exec('CREATE TABLE must_not_survive (id INTEGER)')
        db.exec('PRAGMA user_version = 2')
        throw new Error('boom')
      })
    ).toThrow('boom')

    expect(readUserVersion(db)).toBe(0)
    const leftover = (
      db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'must_not_survive'"
      ).all() as { name: string }[]
    ).map((r) => r.name)
    expect(leftover).toEqual([])
    db.close()
    closeDatabase()
  })
})