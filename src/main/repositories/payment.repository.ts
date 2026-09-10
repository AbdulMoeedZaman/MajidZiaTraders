import { BaseRepository } from './base.repository'
import type { CustomerPayment, CustomerPaymentWithCustomer, CreateCustomerPaymentDTO, PaymentAllocation } from '@shared/types/customer-payment'
import { localDate } from '@shared/date'

// Invoice numbers come from payment_allocations, so payments that were applied automatically
// (no invoice chosen) still show which invoice(s) they paid.
const DETAIL_SELECT = `
  SELECT p.*,
         c.name AS customerName,
         COALESCE(
           (SELECT group_concat(i2.invoiceNumber, ', ')
              FROM payment_allocations a2
              JOIN invoices i2 ON i2.id = a2.invoiceId
             WHERE a2.paymentId = p.id),
           (SELECT i.invoiceNumber FROM invoices i WHERE i.id = p.invoiceId)
         ) AS invoiceNumber,
         (SELECT COUNT(*) FROM payment_allocations a3 WHERE a3.paymentId = p.id) AS allocationCount,
         p.amount - COALESCE((SELECT SUM(a4.amount) FROM payment_allocations a4 WHERE a4.paymentId = p.id), 0) AS unappliedAmount
  FROM customer_payments p
  JOIN customers c ON c.id = p.customerId
`

const UNALLOCATED = `p.amount - COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a.paymentId = p.id), 0)`

export class PaymentRepository extends BaseRepository {
  findAll(): CustomerPayment[] {
    return this.db.prepare('SELECT * FROM customer_payments ORDER BY createdAt DESC').all() as CustomerPayment[]
  }

  findAllWithDetails(from?: string, to?: string): CustomerPaymentWithCustomer[] {
    let sql = DETAIL_SELECT + ' WHERE 1 = 1'
    const params: unknown[] = []
    if (from) {
      sql += ' AND p.paymentDate >= ?'
      params.push(from)
    }
    if (to) {
      sql += ' AND p.paymentDate <= ?'
      params.push(to)
    }
    sql += ' ORDER BY p.paymentDate DESC, p.id DESC'
    return this.db.prepare(sql).all(...params) as CustomerPaymentWithCustomer[]
  }

  findById(id: number): CustomerPayment | null {
    return this.db.prepare('SELECT * FROM customer_payments WHERE id = ?').get(id) as CustomerPayment | null
  }

  findByCustomerId(customerId: number): CustomerPayment[] {
    return this.db
      .prepare('SELECT * FROM customer_payments WHERE customerId = ? ORDER BY paymentDate DESC')
      .all(customerId) as CustomerPayment[]
  }

  findByCustomerIdWithDetails(customerId: number): CustomerPaymentWithCustomer[] {
    return this.db
      .prepare(DETAIL_SELECT + ' WHERE p.customerId = ? ORDER BY p.paymentDate DESC, p.id DESC')
      .all(customerId) as CustomerPaymentWithCustomer[]
  }

  findByInvoiceId(invoiceId: number): CustomerPayment[] {
    return this.db
      .prepare(
        `SELECT p.* FROM payment_allocations a
         JOIN customer_payments p ON p.id = a.paymentId
         WHERE a.invoiceId = ? ORDER BY p.paymentDate DESC, p.id DESC`
      )
      .all(invoiceId) as CustomerPayment[]
  }

  /** Every payment applied to this invoice (chosen directly or applied automatically), with the amount applied to it. */
  findByInvoiceIdWithDetails(invoiceId: number): CustomerPaymentWithCustomer[] {
    return this.db
      .prepare(
        `SELECT p.*,
                c.name AS customerName,
                i.invoiceNumber AS invoiceNumber,
                a.amount AS appliedAmount,
                (SELECT COUNT(*) FROM payment_allocations a3 WHERE a3.paymentId = p.id) AS allocationCount,
                ${UNALLOCATED} AS unappliedAmount
         FROM payment_allocations a
         JOIN customer_payments p ON p.id = a.paymentId
         JOIN customers c ON c.id = p.customerId
         JOIN invoices i ON i.id = a.invoiceId
         WHERE a.invoiceId = ?
         ORDER BY p.paymentDate DESC, p.id DESC`
      )
      .all(invoiceId) as CustomerPaymentWithCustomer[]
  }

  create(data: CreateCustomerPaymentDTO): CustomerPayment {
    const result = this.db
      .prepare(
        `INSERT INTO customer_payments (customerId, invoiceId, amount, method, reference, notes, paymentDate)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.customerId,
        data.invoiceId ?? null,
        data.amount,
        data.method,
        data.reference ?? null,
        data.notes ?? null,
        data.paymentDate ?? localDate()
      )

    return this.findById(result.lastInsertRowid as number)!
  }

  /** Applies `amount` of a payment to an invoice (adds to an existing allocation if there is one). */
  allocate(paymentId: number, invoiceId: number, amount: number): PaymentAllocation {
    this.db
      .prepare(
        `INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?, ?, ?)
         ON CONFLICT(paymentId, invoiceId) DO UPDATE SET amount = amount + excluded.amount`
      )
      .run(paymentId, invoiceId, amount)
    return this.db
      .prepare('SELECT * FROM payment_allocations WHERE paymentId = ? AND invoiceId = ?')
      .get(paymentId, invoiceId) as PaymentAllocation
  }

  getUnallocatedAmount(paymentId: number): number {
    const row = this.db
      .prepare(`SELECT ${UNALLOCATED} AS unallocated FROM customer_payments p WHERE p.id = ?`)
      .get(paymentId) as { unallocated: number } | undefined
    return row?.unallocated ?? 0
  }

  /** The customer's payments that still have money not applied to any invoice (credit), oldest first. */
  findPaymentsWithUnallocated(customerId: number): Array<{ id: number; unallocated: number }> {
    return this.db
      .prepare(
        `SELECT p.id, ${UNALLOCATED} AS unallocated
         FROM customer_payments p
         WHERE p.customerId = ? AND ${UNALLOCATED} > 0
         ORDER BY p.paymentDate ASC, p.id ASC`
      )
      .all(customerId) as Array<{ id: number; unallocated: number }>
  }

  /** Payments the user recorded against this specific invoice (not automatic credit). */
  countDirectPaymentsForInvoice(invoiceId: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM payment_allocations a
         JOIN customer_payments p ON p.id = a.paymentId
         WHERE a.invoiceId = ? AND p.invoiceId = ?`
      )
      .get(invoiceId, invoiceId) as { count: number }
    return row.count
  }

  /** Removes all allocations to an invoice and returns the ids of the payments that were released. */
  releaseAllocationsForInvoice(invoiceId: number): number[] {
    const paymentIds = (
      this.db
        .prepare('SELECT DISTINCT paymentId FROM payment_allocations WHERE invoiceId = ?')
        .all(invoiceId) as Array<{ paymentId: number }>
    ).map((r) => r.paymentId)
    this.db.prepare('DELETE FROM payment_allocations WHERE invoiceId = ?').run(invoiceId)
    return paymentIds
  }

  findAllocationInvoiceIds(paymentId: number): number[] {
    return (
      this.db
        .prepare('SELECT DISTINCT invoiceId FROM payment_allocations WHERE paymentId = ?')
        .all(paymentId) as Array<{ invoiceId: number }>
    ).map((row) => row.invoiceId)
  }

  deleteAllocationsByPayment(paymentId: number): void {
    this.db.prepare('DELETE FROM payment_allocations WHERE paymentId = ?').run(paymentId)
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM customer_payments WHERE id = ?').run(id)
  }

  sumByCustomerId(customerId: number): number {
    const result = this.db
      .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM customer_payments WHERE customerId = ?')
      .get(customerId) as { total: number }
    return result.total
  }

  sumForInvoice(invoiceId: number): number {
    const result = this.db
      .prepare(
        'SELECT COALESCE(SUM(amount), 0) as total FROM payment_allocations WHERE invoiceId = ?'
      )
      .get(invoiceId) as { total: number }
    return result.total
  }

  sumByCustomer(from?: string, to?: string): Array<{ customerId: number; total: number }> {
    let sql = 'SELECT customerId, SUM(amount) AS total FROM customer_payments WHERE 1 = 1'
    const params: unknown[] = []
    if (from) {
      sql += ' AND paymentDate >= ?'
      params.push(from)
    }
    if (to) {
      sql += ' AND paymentDate <= ?'
      params.push(to)
    }
    sql += ' GROUP BY customerId'
    return this.db.prepare(sql).all(...params) as Array<{ customerId: number; total: number }>
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM customer_payments').get() as { count: number }).count
  }
}
