import { BaseRepository } from './base.repository'
import type {
  Invoice,
  InvoiceItem,
  InvoiceWithCustomer,
  InvoiceWithItems,
  CreateInvoiceDTO,
} from '@shared/types/invoice'
import { calculateInvoiceSubtotal, type InvoiceLineInput } from '@shared/calc/invoice-totals'

/** Pre-computed line row ready to persist (amount already calculated). */
export interface InvoiceItemRow {
  productId: number
  productName: string
  rate: number
  minRate: number
  boxesPerCarton: number
  cartonCount: number
  boxCount: number
  amount: number
}

export class InvoiceRepository extends BaseRepository {
  findAllWithCustomer(opts?: {
    from?: string
    to?: string
    customerId?: number
    limit?: number
  }): InvoiceWithCustomer[] {
    let sql = `
      SELECT i.*, c.shopName AS customerName, c.code AS customerCode
      FROM invoices i
      JOIN customers c ON c.id = i.customerId
      WHERE 1 = 1`
    const params: unknown[] = []
    if (opts?.from) {
      sql += ' AND i.date >= ?'
      params.push(opts.from)
    }
    if (opts?.to) {
      sql += ' AND i.date <= ?'
      params.push(opts.to)
    }
    if (opts?.customerId !== undefined) {
      sql += ' AND i.customerId = ?'
      params.push(opts.customerId)
    }
    sql += ' ORDER BY i.date DESC, i.id DESC'
    if (opts?.limit !== undefined) {
      sql += ' LIMIT ?'
      params.push(opts.limit)
    }
    return this.db.prepare(sql).all(...params) as InvoiceWithCustomer[]
  }

  findById(id: number): Invoice | null {
    return this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as Invoice | null
  }

  findByIdWithCustomer(id: number): InvoiceWithCustomer | null {
    return this.db
      .prepare(
        `SELECT i.*, c.shopName AS customerName, c.code AS customerCode
         FROM invoices i
         JOIN customers c ON c.id = i.customerId
         WHERE i.id = ?`
      )
      .get(id) as InvoiceWithCustomer | null
  }

  getItems(invoiceId: number): InvoiceItem[] {
    return this.db
      .prepare('SELECT * FROM invoice_items WHERE invoiceId = ? ORDER BY id')
      .all(invoiceId) as InvoiceItem[]
  }

  findByCustomerId(customerId: number): InvoiceWithCustomer[] {
    return this.db
      .prepare(
        `SELECT i.*, c.shopName AS customerName, c.code AS customerCode
         FROM invoices i
         JOIN customers c ON c.id = i.customerId
         WHERE i.customerId = ?
         ORDER BY i.date DESC, i.id DESC`
      )
      .all(customerId) as InvoiceWithCustomer[]
  }

  generateInvoiceNumber(nextNumber: number): string {
    return `INV-${String(nextNumber).padStart(6, '0')}`
  }

  /**
   * Persists an invoice and its line item rows. `data.items` must already be
   * validated and snapshotted by the service; the subtotal is the sum of the
   * persisted line amounts so storage can never disagree with the lines.
   */
  create(data: CreateInvoiceDTO, invoiceNumber: string, ownerId: number, items: InvoiceItemRow[]): Invoice {
    const subtotal = calculateInvoiceSubtotal(
      items.map<InvoiceLineInput>((item) => ({
        rate: item.rate,
        boxesPerCarton: item.boxesPerCarton,
        cartonCount: item.cartonCount,
        boxCount: item.boxCount,
      }))
    )

    const result = this.db
      .prepare(
        `INSERT INTO invoices
           (invoiceNumber, customerId, ownerId, brokerId, date, filerStatus, subtotal, remaining, tax, grandTotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        invoiceNumber,
        data.customerId,
        ownerId,
        data.brokerId,
        data.date,
        data.filerStatus,
        subtotal,
        data.remaining ?? null,
        data.tax ?? null,
        data.grandTotal ?? null
      )

    const invoiceId = result.lastInsertRowid as number

    for (const item of items) {
      this.db
        .prepare(
          `INSERT INTO invoice_items
             (invoiceId, productId, productName, rate, minRate, boxesPerCarton, cartonCount, boxCount, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          invoiceId,
          item.productId,
          item.productName,
          item.rate,
          item.minRate,
          item.boxesPerCarton,
          item.cartonCount,
          item.boxCount,
          item.amount
        )
    }

    return this.findById(invoiceId)!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM invoices WHERE id = ?').run(id) // invoice_items cascade
  }

  countByCustomer(customerId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM invoices WHERE customerId = ?')
      .get(customerId) as { count: number }
    return result.count
  }

  countByOwner(ownerId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM invoices WHERE ownerId = ?')
      .get(ownerId) as { count: number }
    return result.count
  }

  countByBroker(brokerId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM invoices WHERE brokerId = ?')
      .get(brokerId) as { count: number }
    return result.count
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM invoices').get() as { count: number }).count
  }
}