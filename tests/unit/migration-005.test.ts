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
import { LATEST_MIGRATION_VERSION, runMigrations } from '../../src/main/database/migrations/migrate'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** A database at version 4 holding the inconsistent data that migration 004 left behind. */
function legacyDatabase(): AppDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-mig-'))
  dirs.push(dir)
  const db = new AppDatabase(path.join(dir, 'inventory.db'))
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL DEFAULT (datetime('now')))`)
  const steps: Array<[number, (d: AppDatabase) => void]> = [[1, m1], [2, m2], [3, m3], [4, m4]]
  for (const [version, up] of steps) {
    runInTransaction(db, () => {
      up(db)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(version, `v${version}`)
    })
  }

  db.exec(`
    INSERT INTO customers (id, name) VALUES (10, 'Legacy Customer');
    INSERT INTO products (id, sku, name, baseCostPrice, minSellingPrice, sellingPrice) VALUES (10, 'LEG-1', 'Legacy', 1000, 1200, 1500);

    -- Stock chain: a legacy opening-stock row in the middle stores the absolute level (50) as its quantity,
    -- and the last sale was written with a stale previous quantity.
    INSERT INTO stock_movements (id, productId, type, quantity, previousQuantity, newQuantity, referenceType) VALUES
      (1, 10, 'opening_stock', 100, 0, 100, 'opening_stock'),
      (2, 10, 'sale', -10, 100, 90, 'invoice'),
      (3, 10, 'opening_stock', 50, 90, 50, 'opening_stock'),
      (4, 10, 'sale', -5, 100, 95, 'invoice');

    -- Invoice 1 was fully paid (155.00) under the old tax maths; 004 recomputed its total to 154.00.
    INSERT INTO invoices (id, invoiceNumber, customerId, date, dueDate, subtotal, discount, taxRate, taxAmount, total, totalCost, totalProfit, paid, outstanding, status) VALUES
      (1, 'INV-000001', 10, '2026-09-01', NULL, 15000, 1000, 10, 1400, 15400, 10000, 4000, 15500, -100, 'paid'),
      (2, 'INV-000002', 10, '2026-09-02', '2020-01-05', 2000, 0, 0, 0, 2000, 1000, 1000, 500, 1500, 'overdue');
    INSERT INTO invoice_items (invoiceId, productId, productName, productSku, quantity, costPriceAtSale, minSellingPriceAtSale, actualSellingPrice, lineSubtotal, lineDiscount, lineCost, lineProfit) VALUES
      (1, 10, 'Legacy', 'LEG-1', 10, 1000, 1200, 1500, 15000, 1000, 10000, 4000),
      (2, 10, 'Legacy', 'LEG-1', 1, 1000, 1200, 2000, 2000, 0, 1000, 1000);
    INSERT INTO customer_payments (id, customerId, invoiceId, amount, method, paymentDate) VALUES
      (1, 10, 1, 15500, 'cash', '2026-09-01'),
      (2, 10, NULL, 500, 'cash', '2026-09-03');
    INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (1, 1, 15500), (2, 2, 500);
    INSERT INTO customer_ledger (customerId, type, referenceType, referenceId, debit, credit, transactionDate) VALUES
      (10, 'invoice', 'invoice', 1, 15500, 0, '2026-09-01'),
      (10, 'payment', 'customer_payment', 1, 0, 15500, '2026-09-01'),
      (10, 'invoice', 'invoice', 2, 2000, 0, '2026-09-02'),
      (10, 'payment', 'customer_payment', 2, 0, 500, '2026-09-03');
    INSERT INTO restocks (referenceNumber, supplierName, date, totalCost, status) VALUES ('RS-000007', 'Acme', '2026-09-01', 0, 'pending');
  `)
  return db
}

const snapshot = (db: AppDatabase) => ({
  invoices: db.prepare('SELECT id, paid, outstanding, status, total FROM invoices ORDER BY id').all(),
  allocations: db.prepare('SELECT paymentId, invoiceId, amount FROM payment_allocations ORDER BY paymentId, invoiceId').all(),
  ledger: db.prepare('SELECT id, debit, credit FROM customer_ledger ORDER BY id').all(),
  movements: db.prepare('SELECT id, quantity, previousQuantity, newQuantity FROM stock_movements ORDER BY id').all(),
})

describe('migration 005', () => {
  it('repairs ledgers, over-applied payments and stock chains left by older versions', () => {
    const db = legacyDatabase()
    runMigrations(db)

    expect((db.prepare('SELECT MAX(version) AS v FROM _migrations').get() as { v: number }).v).toBe(LATEST_MIGRATION_VERSION)
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])

    // Ledger charge follows the recomputed total.
    expect(db.prepare("SELECT debit FROM customer_ledger WHERE referenceType = 'invoice' AND referenceId = 1").get()).toEqual({ debit: 15400 })

    // The extra 1.00 paid on invoice 1 moved to invoice 2.
    expect(snapshot(db).allocations).toEqual([
      { paymentId: 1, invoiceId: 1, amount: 15400 },
      { paymentId: 1, invoiceId: 2, amount: 100 },
      { paymentId: 2, invoiceId: 2, amount: 500 },
    ])
    expect(snapshot(db).invoices).toEqual([
      { id: 1, paid: 15400, outstanding: 0, status: 'paid', total: 15400 },
      { id: 2, paid: 600, outstanding: 1400, status: 'overdue', total: 2000 },
    ])

    // Customer balance now matches what their invoices say they owe.
    const balance = db.prepare('SELECT SUM(debit) - SUM(credit) AS b FROM customer_ledger WHERE customerId = 10').get() as { b: number }
    const owed = db.prepare("SELECT SUM(outstanding) AS o FROM invoices WHERE customerId = 10 AND status != 'cancelled'").get() as { o: number }
    expect(balance.b).toBe(owed.o)

    // Stock chain: opening row stores its change, the stale sale is re-chained.
    expect(snapshot(db).movements).toEqual([
      { id: 1, quantity: 100, previousQuantity: 0, newQuantity: 100 },
      { id: 2, quantity: -10, previousQuantity: 100, newQuantity: 90 },
      { id: 3, quantity: -40, previousQuantity: 90, newQuantity: 50 },
      { id: 4, quantity: -5, previousQuantity: 50, newQuantity: 45 },
    ])

    expect(db.prepare("SELECT value FROM settings WHERE key = 'restock_next_number'").get()).toEqual({ value: '8' })
    const adjustmentColumns = (db.prepare('PRAGMA table_info(stock_adjustments)').all() as Array<{ name: string }>).map((c) => c.name)
    expect(adjustmentColumns).toEqual(expect.arrayContaining(['reversedAt', 'reversalMovementId']))
    db.close()
  })

  it('changes nothing when run a second time', () => {
    const db = legacyDatabase()
    runMigrations(db)
    const before = snapshot(db)
    runInTransaction(db, () => m5(db))
    expect(snapshot(db)).toEqual(before)
    db.close()
  })
})
