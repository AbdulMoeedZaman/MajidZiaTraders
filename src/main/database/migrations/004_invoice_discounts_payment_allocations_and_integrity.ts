import type { AppDatabase } from '../sqlite'
import { localDate } from '@shared/date'

interface LegacyMovement {
  id: number
  type: string
  quantity: number
  previousQuantity: number
  newQuantity: number
  referenceType: string | null
}

interface LegacyLine {
  id: number
  lineSubtotal: number
  lineCost: number
}

interface LegacyInvoice {
  id: number
  dueDate: string | null
  discount: number
  taxRate: number
  subtotal: number
  total: number
  totalCost: number
  totalProfit: number
  paid: number
  status: string
}

function recomputeStatus(current: string, dueDate: string | null, paid: number, outstanding: number): string {
  if (current === 'cancelled') return 'cancelled'
  if (outstanding <= 0) return 'paid'
  const overdue = current !== 'draft' && dueDate !== null && dueDate < localDate()
  if (paid <= 0) return overdue ? 'overdue' : 'sent'
  return overdue ? 'overdue' : 'partial'
}

export function up(db: AppDatabase): void {
  const invoiceItemColumns = (
    db.prepare('PRAGMA table_info(invoice_items)').all() as Array<{ name: string }>
  ).map((c) => c.name)
  if (!invoiceItemColumns.includes('lineDiscount')) {
    db.exec('ALTER TABLE invoice_items ADD COLUMN lineDiscount INTEGER NOT NULL DEFAULT 0')
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paymentId INTEGER NOT NULL REFERENCES customer_payments(id) ON DELETE CASCADE,
      invoiceId INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(paymentId);
    CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations(invoiceId);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_allocations_unique ON payment_allocations(paymentId, invoiceId);
  `)

  const legacyPayments = db
    .prepare('SELECT id, customerId, invoiceId, amount FROM customer_payments ORDER BY id ASC')
    .all() as Array<{ id: number; customerId: number; invoiceId: number | null; amount: number }>
  const insertAllocation = db.prepare(
    'INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?, ?, ?)'
  )
  for (const payment of legacyPayments) {
    if (payment.invoiceId) {
      insertAllocation.run(payment.id, payment.invoiceId, payment.amount)
      continue
    }
    const open = db
      .prepare(
        `SELECT id, outstanding FROM invoices
         WHERE customerId = ? AND status != 'cancelled' AND outstanding > 0
         ORDER BY date ASC, id ASC`
      )
      .all(payment.customerId) as Array<{ id: number; outstanding: number }>
    let remaining = payment.amount
    for (const invoice of open) {
      if (remaining <= 0) break
      const amount = Math.min(remaining, invoice.outstanding)
      insertAllocation.run(payment.id, invoice.id, amount)
      remaining -= amount
    }
  }

  const productIds = (
    db
      .prepare('SELECT DISTINCT productId FROM stock_movements ORDER BY productId')
      .all() as Array<{ productId: number }>
  ).map((r) => r.productId)
  const rowsFor = db.prepare(
    `SELECT id, type, quantity, previousQuantity, newQuantity, referenceType
     FROM stock_movements WHERE productId = ? ORDER BY id ASC`
  )
  const fixMovement = db.prepare('UPDATE stock_movements SET previousQuantity = ?, newQuantity = ? WHERE id = ?')
  for (const productId of productIds) {
    const movements = rowsFor.all(productId) as LegacyMovement[]
    let running = 0
    for (const movement of movements) {
      if (movement.referenceType === 'opening_stock') {
        running = movement.newQuantity
        continue
      }
      const previous = running
      running += movement.quantity
      if (movement.previousQuantity !== previous || movement.newQuantity !== running) {
        fixMovement.run(previous, running, movement.id)
      }
    }
  }

  const invoices = db.prepare('SELECT * FROM invoices ORDER BY id ASC').all() as LegacyInvoice[]
  const itemsFor = db.prepare('SELECT id, lineSubtotal, lineCost FROM invoice_items WHERE invoiceId = ? ORDER BY id ASC')
  const fixItem = db.prepare('UPDATE invoice_items SET lineDiscount = ?, lineProfit = ? WHERE id = ?')
  const fixInvoice = db.prepare(
    `UPDATE invoices SET taxAmount = ?, total = ?, totalProfit = ?, paid = ?, outstanding = ?, status = ?, updatedAt = datetime('now') WHERE id = ?`
  )
  const allocationSumFor = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM payment_allocations WHERE invoiceId = ?'
  )
  for (const invoice of invoices) {
    const lines = itemsFor.all(invoice.id) as LegacyLine[]
    if (lines.length === 0) continue

    const subtotal = lines.reduce((sum, line) => sum + line.lineSubtotal, 0)
    const totalCost = lines.reduce((sum, line) => sum + line.lineCost, 0)
    const discount = Math.min(invoice.discount, subtotal)
    const taxAmount = Math.round((subtotal - discount) * (invoice.taxRate / 100))
    const total = subtotal - discount + taxAmount
    const totalProfit = subtotal - discount - totalCost

    const lineTotals = lines.map((line) => line.lineSubtotal)
    const totalForAlloc = lineTotals.reduce((sum, value) => sum + value, 0)
    let remaining = discount
    for (let i = 0; i < lines.length; i++) {
      let lineDiscount = 0
      if (remaining > 0 && totalForAlloc > 0) {
        if (i === lines.length - 1) {
          lineDiscount = Math.min(remaining, lineTotals[i])
        } else {
          lineDiscount = Math.min(remaining, Math.round((lineTotals[i] / totalForAlloc) * discount))
        }
      }
      remaining = Math.max(0, remaining - lineDiscount)
      const lineProfit = lines[i].lineSubtotal - lineDiscount - lines[i].lineCost
      fixItem.run(lineDiscount, lineProfit, lines[i].id)
    }

    const paid = (allocationSumFor.get(invoice.id) as { total: number }).total
    const outstanding = total - paid
    const status = recomputeStatus(invoice.status, invoice.dueDate, paid, outstanding)
    fixInvoice.run(taxAmount, total, totalProfit, paid, outstanding, status, invoice.id)
  }

  db.exec('PRAGMA foreign_keys = OFF')

  db.exec(`
    CREATE TABLE invoice_items_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      productName TEXT NOT NULL,
      productSku TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'piece',
      quantity INTEGER NOT NULL,
      costPriceAtSale INTEGER NOT NULL DEFAULT 0,
      minSellingPriceAtSale INTEGER NOT NULL DEFAULT 0,
      actualSellingPrice INTEGER NOT NULL DEFAULT 0,
      lineSubtotal INTEGER NOT NULL DEFAULT 0,
      lineDiscount INTEGER NOT NULL DEFAULT 0,
      lineCost INTEGER NOT NULL DEFAULT 0,
      lineProfit INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO invoice_items_new
      (id, invoiceId, productId, productName, productSku, unit, quantity, costPriceAtSale, minSellingPriceAtSale, actualSellingPrice, lineSubtotal, lineDiscount, lineCost, lineProfit, createdAt)
      SELECT id, invoiceId, productId, productName, productSku, unit, quantity, costPriceAtSale, minSellingPriceAtSale, actualSellingPrice, lineSubtotal, lineDiscount, lineCost, lineProfit, createdAt
      FROM invoice_items;
    DROP TABLE invoice_items;
    ALTER TABLE invoice_items_new RENAME TO invoice_items;

    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(productId);
  `)

  db.exec(`
    CREATE TABLE restock_items_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restockId INTEGER NOT NULL REFERENCES restocks(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      unit TEXT NOT NULL DEFAULT 'piece',
      quantity INTEGER NOT NULL,
      unitCost INTEGER NOT NULL DEFAULT 0,
      totalCost INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO restock_items_new
      (id, restockId, productId, unit, quantity, unitCost, totalCost, createdAt)
      SELECT id, restockId, productId, unit, quantity, unitCost, totalCost, createdAt
      FROM restock_items;
    DROP TABLE restock_items;
    ALTER TABLE restock_items_new RENAME TO restock_items;

    CREATE INDEX IF NOT EXISTS idx_restock_items_restock ON restock_items(restockId);
    CREATE INDEX IF NOT EXISTS idx_restock_items_product ON restock_items(productId);
  `)

  db.exec('PRAGMA foreign_keys = ON')

  const profileCount = (
    db.prepare('SELECT COUNT(*) AS count FROM business_profile').get() as { count: number }
  ).count
  if (profileCount === 0) {
    db.prepare(
      'INSERT INTO business_profile (name, currency, invoicePrefix, invoiceNextNumber) VALUES (?, ?, ?, ?)'
    ).run('MZTraders', 'PKR', 'INV-', 1)
  }
}