import type Database from 'better-sqlite3'
import { localDate } from '@shared/date'
import { computeInvoiceStatus, type InvoiceStatus } from '@shared/calc/invoice-totals'

// Repairs data left inconsistent by migration 004 and older versions. Safe to run on any
// database from version 3 onwards; running the steps again changes nothing.
//  1. stock_adjustments gets reversal columns (adjustments are reversed, never deleted).
//  2. Every product's stock chain is rebuilt in id order; opening-stock rows store their change.
//  3. Customer ledger charges are set to the (recomputed) invoice totals.
//  4. Payment allocations above an invoice's total are trimmed; the freed money is applied to
//     the customer's other open invoices, oldest first, and any rest stays as credit.
//  5. paid / outstanding / status are recomputed for every invoice.
//  6. The restock number counter is seeded so numbers are never reused.

function columnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
}

export function up(db: Database.Database): void {
  const today = localDate()

  // 1. Reversal columns.
  const adjustmentColumns = columnNames(db, 'stock_adjustments')
  if (!adjustmentColumns.includes('reversedAt')) {
    db.exec('ALTER TABLE stock_adjustments ADD COLUMN reversedAt TEXT')
  }
  if (!adjustmentColumns.includes('reversalMovementId')) {
    db.exec('ALTER TABLE stock_adjustments ADD COLUMN reversalMovementId INTEGER')
  }

  // 2. Stock chains.
  const productIds = (
    db.prepare('SELECT DISTINCT productId FROM stock_movements ORDER BY productId').all() as Array<{ productId: number }>
  ).map((r) => r.productId)
  const movementsFor = db.prepare(
    `SELECT id, type, quantity, previousQuantity, newQuantity, referenceType
     FROM stock_movements WHERE productId = ? ORDER BY id ASC`
  )
  const fixMovement = db.prepare(
    'UPDATE stock_movements SET quantity = ?, previousQuantity = ?, newQuantity = ? WHERE id = ?'
  )
  for (const productId of productIds) {
    const movements = movementsFor.all(productId) as Array<{
      id: number
      type: string
      quantity: number
      previousQuantity: number
      newQuantity: number
      referenceType: string | null
    }>
    let running = 0
    for (const m of movements) {
      const isOpening = m.type === 'opening_stock' || m.referenceType === 'opening_stock'
      const previous = running
      const next = isOpening ? m.newQuantity : running + m.quantity
      const quantity = next - previous
      if (m.quantity !== quantity || m.previousQuantity !== previous || m.newQuantity !== next) {
        fixMovement.run(quantity, previous, next, m.id)
      }
      running = next
    }
  }

  // 3. Ledger charges follow the invoice totals.
  db.prepare(
    `UPDATE customer_ledger
     SET debit = (SELECT i.total FROM invoices i WHERE i.id = customer_ledger.referenceId)
     WHERE referenceType = 'invoice'
       AND EXISTS (
         SELECT 1 FROM invoices i
         WHERE i.id = customer_ledger.referenceId AND i.status != 'cancelled' AND i.total != customer_ledger.debit
       )`
  ).run()

  // 4. Trim over-allocations (newest allocation first) and release allocations on cancelled invoices.
  const freedPayments = new Set<number>()
  const over = db
    .prepare(
      `SELECT i.id, i.total, SUM(a.amount) AS allocated
       FROM invoices i JOIN payment_allocations a ON a.invoiceId = i.id
       WHERE i.status != 'cancelled'
       GROUP BY i.id HAVING SUM(a.amount) > i.total`
    )
    .all() as Array<{ id: number; total: number; allocated: number }>
  const allocationsFor = db.prepare(
    'SELECT id, paymentId, amount FROM payment_allocations WHERE invoiceId = ? ORDER BY id DESC'
  )
  const deleteAllocation = db.prepare('DELETE FROM payment_allocations WHERE id = ?')
  const reduceAllocation = db.prepare('UPDATE payment_allocations SET amount = amount - ? WHERE id = ?')
  for (const invoice of over) {
    let excess = invoice.allocated - invoice.total
    for (const a of allocationsFor.all(invoice.id) as Array<{ id: number; paymentId: number; amount: number }>) {
      if (excess <= 0) break
      const cut = Math.min(a.amount, excess)
      if (cut === a.amount) deleteAllocation.run(a.id)
      else reduceAllocation.run(cut, a.id)
      excess -= cut
      freedPayments.add(a.paymentId)
    }
  }
  const onCancelled = db
    .prepare(
      `SELECT a.id, a.paymentId FROM payment_allocations a
       JOIN invoices i ON i.id = a.invoiceId WHERE i.status = 'cancelled'`
    )
    .all() as Array<{ id: number; paymentId: number }>
  for (const a of onCancelled) {
    deleteAllocation.run(a.id)
    freedPayments.add(a.paymentId)
  }

  // 5a. paid / outstanding from allocations (status comes after re-applying credit).
  const allocatedTo = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM payment_allocations WHERE invoiceId = ?')
  const setPaid = db.prepare('UPDATE invoices SET paid = ?, outstanding = ? WHERE id = ?')
  const syncPaid = (invoiceId: number, total: number): void => {
    const paid = (allocatedTo.get(invoiceId) as { total: number }).total
    setPaid.run(paid, total - paid, invoiceId)
  }
  for (const inv of db.prepare('SELECT id, total FROM invoices').all() as Array<{ id: number; total: number }>) {
    syncPaid(inv.id, inv.total)
  }

  // 4b. Freed money goes to the customer's other open invoices, oldest first.
  const paymentRow = db.prepare(
    `SELECT p.id, p.customerId,
            p.amount - COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a.paymentId = p.id), 0) AS unallocated
     FROM customer_payments p WHERE p.id = ?`
  )
  const openInvoices = db.prepare(
    `SELECT id, total, outstanding FROM invoices
     WHERE customerId = ? AND status != 'cancelled' AND outstanding > 0
     ORDER BY date ASC, id ASC`
  )
  const upsertAllocation = db.prepare(
    `INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?, ?, ?)
     ON CONFLICT(paymentId, invoiceId) DO UPDATE SET amount = amount + excluded.amount`
  )
  for (const paymentId of freedPayments) {
    const payment = paymentRow.get(paymentId) as { id: number; customerId: number; unallocated: number } | undefined
    if (!payment) continue
    let remaining = payment.unallocated
    for (const inv of openInvoices.all(payment.customerId) as Array<{ id: number; total: number; outstanding: number }>) {
      if (remaining <= 0) break
      const amount = Math.min(remaining, inv.outstanding)
      upsertAllocation.run(payment.id, inv.id, amount)
      syncPaid(inv.id, inv.total)
      remaining -= amount
    }
  }

  // 5b. Final paid / outstanding / status for every invoice.
  const invoices = db
    .prepare('SELECT id, status, dueDate, total, paid, outstanding FROM invoices')
    .all() as Array<{ id: number; status: InvoiceStatus; dueDate: string | null; total: number; paid: number; outstanding: number }>
  const setState = db.prepare('UPDATE invoices SET paid = ?, outstanding = ?, status = ? WHERE id = ?')
  for (const inv of invoices) {
    const paid = (allocatedTo.get(inv.id) as { total: number }).total
    const outstanding = inv.total - paid
    const status = computeInvoiceStatus({ status: inv.status, dueDate: inv.dueDate, paid, outstanding }, today)
    if (paid !== inv.paid || outstanding !== inv.outstanding || status !== inv.status) {
      setState.run(paid, outstanding, status, inv.id)
    }
  }

  // 6. Restock number counter.
  const maxRestockNo = (
    db
      .prepare(
        "SELECT COALESCE(MAX(CAST(SUBSTR(referenceNumber, 4) AS INTEGER)), 0) AS maxNo FROM restocks WHERE referenceNumber LIKE 'RS-%'"
      )
      .get() as { maxNo: number }
  ).maxNo
  db.prepare("INSERT OR IGNORE INTO settings (key, value, type) VALUES ('restock_next_number', ?, 'number')").run(
    String(maxRestockNo + 1)
  )
}
