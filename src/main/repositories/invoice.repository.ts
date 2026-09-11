import { BaseRepository } from './base.repository'
import type {
  Invoice,
  InvoiceItem,
  InvoiceWithCustomer,
  CreateInvoiceDTO,
  CreateInvoiceItemDTO,
  UpdateInvoiceDTO,
} from '@shared/types/invoice'
import { localDate } from '@shared/date'
import { allocateDiscount, calculateInvoiceTotals, computeInvoiceStatus } from '@shared/calc/invoice-totals'

export interface InvoicePeriodSummary {
  count: number
  revenue: number
  cost: number
  profit: number
  customers: number
}

export interface ProductSalesRow {
  productId: number
  productName: string
  productSku: string
  quantitySold: number
  revenue: number
  cost: number
  profit: number
}

export class InvoiceRepository extends BaseRepository {
  findAll(): Invoice[] {
    return this.db.prepare('SELECT * FROM invoices ORDER BY createdAt DESC').all() as Invoice[]
  }

  findAllWithCustomer(opts?: {
    from?: string
    to?: string
    status?: string
    customerId?: number
    limit?: number
  }): InvoiceWithCustomer[] {
    let sql = `
      SELECT i.*, c.name AS customerName
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
    if (opts?.status) {
      sql += ' AND i.status = ?'
      params.push(opts.status)
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

  summarizePeriod(from: string, to: string): InvoicePeriodSummary {
    const result = this.db
      .prepare(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(subtotal - discount), 0) AS revenue,
                COALESCE(SUM(totalCost), 0) AS cost,
                COALESCE(SUM(totalProfit), 0) AS profit,
                COUNT(DISTINCT customerId) AS customers
         FROM invoices
         WHERE status != 'cancelled' AND date >= ? AND date <= ?`
      )
      .get(from, to) as InvoicePeriodSummary
    return result
  }

  findItemsForPeriod(from: string, to: string): ProductSalesRow[] {
    return this.db
      .prepare(
        `SELECT it.productId AS productId,
                it.productName AS productName,
                it.productSku AS productSku,
                SUM(it.quantity) AS quantitySold,
                SUM(it.lineSubtotal - it.lineDiscount) AS revenue,
                SUM(it.lineCost) AS cost,
                SUM(it.lineProfit) AS profit
         FROM invoice_items it
         JOIN invoices i ON i.id = it.invoiceId
         WHERE i.status != 'cancelled' AND i.date >= ? AND i.date <= ?
         GROUP BY it.productId, it.productName, it.productSku
         ORDER BY quantitySold DESC`
      )
      .all(from, to) as ProductSalesRow[]
  }

  sumByCustomer(from?: string, to?: string): Array<{ customerId: number; total: number }> {
    let sql = `SELECT customerId, SUM(total) AS total FROM invoices WHERE status != 'cancelled'`
    const params: unknown[] = []
    if (from) {
      sql += ' AND date >= ?'
      params.push(from)
    }
    if (to) {
      sql += ' AND date <= ?'
      params.push(to)
    }
    sql += ' GROUP BY customerId'
    return this.db.prepare(sql).all(...params) as Array<{ customerId: number; total: number }>
  }

  findById(id: number): Invoice | null {
    return this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as Invoice | null
  }

  findByCustomerId(customerId: number): Invoice[] {
    return this.db
      .prepare('SELECT * FROM invoices WHERE customerId = ? ORDER BY createdAt DESC')
      .all(customerId) as Invoice[]
  }

  findByStatus(status: Invoice['status']): Invoice[] {
    return this.db
      .prepare('SELECT * FROM invoices WHERE status = ? ORDER BY createdAt DESC')
      .all(status) as Invoice[]
  }

  generateInvoiceNumber(prefix: string, nextNumber: number): string {
    return `${prefix}${String(nextNumber).padStart(6, '0')}`
  }

  create(data: CreateInvoiceDTO, invoiceNumber: string): Invoice {
    const totals = calculateInvoiceTotals(
      data.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.actualSellingPrice,
        unitCost: item.costPriceAtSale,
      })),
      data.discount ?? 0
    )
    const status = data.status ?? 'sent'

    const result = this.db.prepare(
      `INSERT INTO invoices (invoiceNumber, customerId, date, dueDate, subtotal, discount, taxRate, taxAmount, total, totalCost, totalProfit, paid, outstanding, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      invoiceNumber,
      data.customerId,
      data.date,
      data.dueDate ?? null,
      totals.subtotal,
      totals.discount,
      0,
      0,
      totals.total,
      totals.totalCost,
      totals.profit,
      0,
      totals.total,
      status,
      data.notes ?? null
    )

    const invoiceId = result.lastInsertRowid as number

    for (let i = 0; i < data.items.length; i++) {
      this.createItem(invoiceId, data.items[i], totals.lines[i].lineDiscount)
    }

    return this.findById(invoiceId)!
  }

  createItem(invoiceId: number, item: CreateInvoiceItemDTO, lineDiscount = 0): InvoiceItem {
    const lineSubtotal = item.quantity * item.actualSellingPrice
    const lineCost = item.quantity * item.costPriceAtSale
    const lineProfit = (lineSubtotal - lineDiscount) - lineCost

    const result = this.db
      .prepare(
        `INSERT INTO invoice_items (invoiceId, productId, productName, productSku, unit, quantity, costPriceAtSale, minSellingPriceAtSale, actualSellingPrice, lineSubtotal, lineDiscount, lineCost, lineProfit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        invoiceId,
        item.productId,
        item.productName,
        item.productSku,
        item.unit ?? 'piece',
        item.quantity,
        item.costPriceAtSale,
        item.minSellingPriceAtSale,
        item.actualSellingPrice,
        lineSubtotal,
        lineDiscount,
        lineCost,
        lineProfit
      )

    return this.db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(result.lastInsertRowid) as InvoiceItem
  }

  getItems(invoiceId: number): InvoiceItem[] {
    return this.db
      .prepare('SELECT * FROM invoice_items WHERE invoiceId = ?')
      .all(invoiceId) as InvoiceItem[]
  }

  update(id: number, data: UpdateInvoiceDTO): Invoice {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.customerId !== undefined) { fields.push('customerId = ?'); values.push(data.customerId) }
    if (data.date !== undefined) { fields.push('date = ?'); values.push(data.date) }
    if (data.dueDate !== undefined) { fields.push('dueDate = ?'); values.push(data.dueDate || null) }
    if (data.discount !== undefined) { fields.push('discount = ?'); values.push(data.discount) }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status) }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes) }

    if (fields.length > 0) {
      fields.push("updatedAt = datetime('now')")
      values.push(id)
      this.db.prepare(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    if (data.items) {
      const invoice = this.findById(id)
      const discount = data.discount ?? invoice?.discount ?? 0
      const lineDiscounts = allocateDiscount(
        data.items.map((item) => item.quantity * item.actualSellingPrice),
        discount
      )
      this.db.prepare('DELETE FROM invoice_items WHERE invoiceId = ?').run(id)
      for (let i = 0; i < data.items.length; i++) {
        this.createItem(id, data.items[i], lineDiscounts[i])
      }
    }

    return this.findById(id)!
  }

  findOpenInvoicesForCustomer(customerId: number): Invoice[] {
    return this.db
      .prepare(
        `SELECT * FROM invoices
         WHERE customerId = ? AND status != 'cancelled' AND outstanding > 0
         ORDER BY date ASC, id ASC`
      )
      .all(customerId) as Invoice[]
  }

  countItemsByProductId(productId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM invoice_items WHERE productId = ?')
      .get(productId) as { count: number }
    return result.count
  }

  markOverdue(today = localDate()): number {
    const result = this.db
      .prepare(
        `UPDATE invoices
         SET status = 'overdue', updatedAt = datetime('now')
         WHERE status IN ('sent', 'partial')
           AND outstanding > 0
           AND dueDate IS NOT NULL
           AND dueDate < ?`
      )
      .run(today)
    return result.changes
  }

  /** Recalculates paid / outstanding / status from the invoice's payment allocations. */
  recomputePaymentState(id: number, today = localDate()): Invoice | null {
    const invoice = this.findById(id)
    if (!invoice) return null
    const paid = (
      this.db
        .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM payment_allocations WHERE invoiceId = ?')
        .get(id) as { total: number }
    ).total
    const outstanding = invoice.total - paid
    const status = computeInvoiceStatus({ status: invoice.status, dueDate: invoice.dueDate, paid, outstanding }, today)
    this.db
      .prepare("UPDATE invoices SET paid = ?, outstanding = ?, status = ?, updatedAt = datetime('now') WHERE id = ?")
      .run(paid, outstanding, status, id)
    return this.findById(id)
  }

  /** Throws if an invoice's money no longer adds up. Call inside the transaction that changed it. */
  assertConsistency(id: number): void {
    const invoice = this.findById(id)
    if (!invoice || invoice.status === 'cancelled') return
    if (invoice.outstanding < 0) {
      throw new Error(`Invoice ${invoice.invoiceNumber} would be overpaid (outstanding ${invoice.outstanding} cents)`)
    }
    if (invoice.paid + invoice.outstanding !== invoice.total) {
      throw new Error(`Invoice ${invoice.invoiceNumber}: paid + outstanding does not equal the total`)
    }
    const ledger = this.db
      .prepare("SELECT SUM(debit) AS debit FROM customer_ledger WHERE referenceType = 'invoice' AND referenceId = ?")
      .get(id) as { debit: number | null }
    if (ledger.debit !== null && ledger.debit !== invoice.total) {
      throw new Error(`Invoice ${invoice.invoiceNumber}: customer ledger charge does not match the invoice total`)
    }
  }

  updatePaid(id: number, paid: number): void {
    const invoice = this.findById(id)
    if (!invoice) return
    const outstanding = invoice.total - paid
    this.db.prepare("UPDATE invoices SET paid = ?, outstanding = ?, updatedAt = datetime('now') WHERE id = ?").run(paid, outstanding, id)
  }

  updateStatus(id: number, status: Invoice['status']): void {
    this.db.prepare("UPDATE invoices SET status = ?, updatedAt = datetime('now') WHERE id = ?").run(status, id)
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM invoice_items WHERE invoiceId = ?').run(id)
    this.db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM invoices').get() as { count: number }).count
  }
}
