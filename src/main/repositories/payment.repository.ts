import { BaseRepository } from './base.repository'
import type { Payment } from '@shared/types/payment'
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

  findByCustomer(customerId: number): Payment[] {
    return this.db
      .prepare('SELECT * FROM payments WHERE customerId = ? ORDER BY date DESC, id DESC')
      .all(customerId) as Payment[]
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

  deleteForInvoice(invoiceId: number): void {
    this.db.prepare('DELETE FROM payments WHERE invoiceId = ?').run(invoiceId)
  }
}