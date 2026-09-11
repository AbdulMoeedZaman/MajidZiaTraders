import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDatabase, runInTransaction } from '../../src/main/database/sqlite'
import { up as m1 } from '../../src/main/database/migrations/001_initial_schema'
import { up as m2 } from '../../src/main/database/migrations/002_business_modules'
import { up as m3 } from '../../src/main/database/migrations/003_complete_business_schema'
import { up as m4 } from '../../src/main/database/migrations/004_invoice_discounts_payment_allocations_and_integrity'
import { up as m5 } from '../../src/main/database/migrations/005_ledger_sync_allocation_repair_and_reversals'
import { up as m6 } from '../../src/main/database/migrations/006_product_purchase_structure'
import { LATEST_MIGRATION_VERSION, runMigrations } from '../../src/main/database/migrations/migrate'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** A database at version 5 holding pre-trade-invoice restock data. */
function legacyDatabase(): AppDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-mig-'))
  dirs.push(dir)
  const db = new AppDatabase(path.join(dir, 'inventory.db'))
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL DEFAULT (datetime('now')))`)
  const steps: Array<[number, (d: AppDatabase) => void]> = [[1, m1], [2, m2], [3, m3], [4, m4], [5, m5]]
  for (const [version, up] of steps) {
    runInTransaction(db, () => {
      up(db)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(version, `v${version}`)
    })
  }

  db.exec(`
    INSERT INTO products (id, sku, name, baseCostPrice, minSellingPrice, sellingPrice) VALUES
      (10, 'LEG-1', 'Legacy Widget', 1000, 1200, 1500);
    INSERT INTO restocks (id, referenceNumber, supplierName, date, totalCost, status) VALUES
      (10, 'RS-000010', 'Acme', '2026-09-01', 31500, 'pending');
    INSERT INTO restock_items (restockId, productId, quantity, unitCost, totalCost) VALUES
      (10, 10, 30, 1050, 31500);
  `)
  return db
}

const tableColumns = (db: AppDatabase, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)

describe('migration 006', () => {
  it('rebuilds restock_items, adds header/product columns and seeds tax-rate defaults', () => {
    const db = legacyDatabase()
    runMigrations(db)

    expect((db.prepare('SELECT MAX(version) AS v FROM _migrations').get() as { v: number }).v).toBe(LATEST_MIGRATION_VERSION)
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])

    // Product pack/purchase columns exist; defaults are sensible.
    const productColumns = tableColumns(db, 'products')
    expect(productColumns).toEqual(expect.arrayContaining(['packSize', 'packConfig', 'mrp', 'purchaseUnit']))
    expect(db.prepare('SELECT purchaseUnit FROM products WHERE id = 10').get()).toEqual({ purchaseUnit: 'carton' })
    expect(db.prepare('SELECT mrp FROM products WHERE id = 10').get()).toEqual({ mrp: null })

    // Restock header fields exist.
    const restockColumns = tableColumns(db, 'restocks')
    expect(restockColumns).toEqual(
      expect.arrayContaining([
        'supplierInvoiceNo', 'supplierRegistrationNo', 'buyerNtn', 'buyerCnic', 'dispatchNoteNo', 'salesOrderNo',
        'totalRetailValueExcl', 'totalSalesTax', 'totalAdvanceTax', 'totalTradeDiscount', 'totalNetValueExcl',
      ])
    )
    // Old flat-cost restock becomes its own net value; grand total payable is unchanged.
    expect(db.prepare('SELECT totalNetValueExcl, totalCost FROM restocks WHERE id = 10').get()).toEqual({ totalNetValueExcl: 31500, totalCost: 31500 })

    // Restock item gained the tax/discount structure and legacy rows were backfilled.
    const itemColumns = tableColumns(db, 'restock_items')
    expect(itemColumns).toEqual(
      expect.arrayContaining([
        'qtyCartons', 'piecesPerCarton', 'mrpPerPiece', 'salesTaxRate', 'retailPricePerCarton',
        'totalRetailValueExcl', 'salesTaxAmount', 'advanceTaxRate', 'advanceTax', 'netSalesValueExcl',
        'tradeDiscountValue', 'discountedValueInclusive',
      ])
    )
    expect(itemColumns).not.toContain('quantity')
    expect(itemColumns).not.toContain('unitCost')
    expect(itemColumns).not.toContain('unit')
    expect(itemColumns).not.toContain('totalCost')

    const item = db.prepare('SELECT * FROM restock_items WHERE restockId = 10').get() as Record<string, unknown>
    expect(item.qtyCartons).toBe(30)
    expect(item.piecesPerCarton).toBe(1)
    expect(item.netSalesValueExcl).toBe(31500)
    expect(item.discountedValueInclusive).toBe(31500)
    expect(item.salesTaxRate).toBe(1800)
    expect(item.advanceTaxRate).toBe(10)
    expect(item.salesTaxAmount).toBe(0)
    expect(item.advanceTax).toBe(0)

    // Business-wide defaults are seeded.
    expect(db.prepare("SELECT value FROM settings WHERE key = 'purchaseSalesTaxRateBps'").get()).toEqual({ value: '1800' })
    expect(db.prepare("SELECT value FROM settings WHERE key = 'purchaseAdvanceTaxRateBps'").get()).toEqual({ value: '10' })

    db.close()
  })

  it('changes nothing when run a second time', () => {
    const db = legacyDatabase()
    runMigrations(db)
    const before = {
      products: db.prepare('SELECT * FROM products ORDER BY id').all(),
      restocks: db.prepare('SELECT * FROM restocks ORDER BY id').all(),
      items: db.prepare('SELECT * FROM restock_items ORDER BY id').all(),
      settings: db.prepare("SELECT * FROM settings WHERE key IN ('purchaseSalesTaxRateBps', 'purchaseAdvanceTaxRateBps')").all(),
    }
    runInTransaction(db, () => m6(db))
    expect(db.prepare('SELECT * FROM products ORDER BY id').all()).toEqual(before.products)
    expect(db.prepare('SELECT * FROM restocks ORDER BY id').all()).toEqual(before.restocks)
    expect(db.prepare('SELECT * FROM restock_items ORDER BY id').all()).toEqual(before.items)
    expect(db.prepare("SELECT * FROM settings WHERE key IN ('purchaseSalesTaxRateBps', 'purchaseAdvanceTaxRateBps')").all()).toEqual(before.settings)
    db.close()
  })
})