import { BaseRepository } from './base.repository'
import type { Payment, RecentPayment } from '@shared/types/payment'
import type { InvoiceWithCustomer } from '@shared/types/invoice'

export class PaymentRepository extends BaseRepository {
  insert(data: {
    invoiceId: number
    customerId: number
    amount: number
    date: string
    note: string | null
  }): Payment {
    const result = this.db
      .prepare(
        `INSERT INTO payments (invoiceId, customerId, amount, date, note)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(data.invoiceId, data.customerId, data.amount, data.date, data.note)
    return this.db
      .prepare('SELECT * FROM payments WHERE id = ?')
      .get(result.lastInsertRowid as number) as Payment
  }

  findByInvoice(invoiceId: number): Payment[] {
    return this.db
      .prepare('SELECT * FROM payments WHERE invoiceId = ? ORDER BY date DESC, id DESC')
      .all(invoiceId) as Payment[]
  }

  findById(id: number): Payment | null {
    return this.db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Payment | null
  }

  findByCustomer(customerId: number): Payment[] {
    return this.db
      .prepare('SELECT * FROM payments WHERE customerId = ? ORDER BY date DESC, id DESC')
      .all(customerId) as Payment[]
  }

  /** Newest payments with invoice number + customer name (adjustments screen). */
  findRecent(limit: number): RecentPayment[] {
    return this.db
      .prepare(
        `SELECT p.*, i.invoiceNumber, c.shopName AS customerName
         FROM payments p
         JOIN invoices i ON i.id = p.invoiceId
         JOIN customers c ON c.id = p.customerId
         ORDER BY p.date DESC, p.id DESC
         LIMIT ?`
      )
      .all(limit) as RecentPayment[]
  }

  /**
   * Open (unpaid or part-paid) invoices for a customer, oldest first, ready to be
   * settled oldest-invoice-first by a customer payment.
   */
  findOpenByCustomer(customerId: number): InvoiceWithCustomer[] {
    return this.db
      .prepare(
        `SELECT i.*, c.shopName AS customerName, c.code AS customerCode
         FROM invoices i
         JOIN customers c ON c.id = i.customerId
         WHERE i.customerId = ? AND i.status IN ('unpaid', 'partial')
         ORDER BY i.date ASC, i.id ASC`
      )
      .all(customerId) as InvoiceWithCustomer[]
  }

  sumByCustomer(customerId: number): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE customerId = ?')
      .get(customerId) as { total: number }
    return row.total
  }

  sumByInvoice(invoiceId: number): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoiceId = ?')
      .get(invoiceId) as { total: number }
    return row.total
  }

  deleteById(id: number): void {
    this.db.prepare('DELETE FROM payments WHERE id = ?').run(id)
  }

  /** Re-inserts a payment with its original id (redo of payment_recorded). */
  insertExplicit(payment: Payment): Payment {
    this.db
      .prepare(
        `INSERT INTO payments (id, invoiceId, customerId, amount, date, note, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        payment.id,
        payment.invoiceId,
        payment.customerId,
        payment.amount,
        payment.date,
        payment.note,
        payment.createdAt
      )
    return this.db
      .prepare('SELECT * FROM payments WHERE id = ?')
      .get(payment.id) as Payment
  }

  deleteForInvoice(invoiceId: number): void {
    this.db.prepare('DELETE FROM payments WHERE invoiceId = ?').run(invoiceId)
  }
}