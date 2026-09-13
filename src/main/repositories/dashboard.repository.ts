import { BaseRepository } from './base.repository'
import type { Product } from '@shared/types/product'
import type { CustomerWithRoute } from '@shared/types/customer'
import type { Expense } from '@shared/types/expense'
import type { CustomerOwed, CashInward, TodayDispatch } from '@shared/types/dashboard'

/** One invoice line inside the range, with everything needed to compute profit. */
export interface ProfitLineRow {
  invoiceId: number
  customerId: number
  customerName: string
  amount: number
  minRate: number
  boxesPerCarton: number
  cartonCount: number
  boxCount: number
}

export interface ProductRemainingRow {
  productId: number
  productName: string
  /** Pieces per carton, so remaining can be split into whole cartons + loose pieces. */
  boxesPerCarton: number
  remaining: number
}

export class DashboardRepository extends BaseRepository {
  profitLines(from: string, to: string): ProfitLineRow[] {
    return this.db
      .prepare(
        `SELECT ii.invoiceId, ii.amount, ii.minRate, ii.boxesPerCarton, ii.cartonCount, ii.boxCount,
                c.id AS customerId, c.shopName AS customerName
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoiceId
         JOIN customers c ON c.id = i.customerId
         WHERE i.date >= ? AND i.date <= ? AND i.status != 'cancelled'
         ORDER BY i.date DESC, i.id DESC`
      )
      .all(from, to) as ProfitLineRow[]
  }

  /** Every product's current stock level (latest ledger running balance, in pieces). */
  remainingPerProduct(): ProductRemainingRow[] {
    return this.db
      .prepare(
        `SELECT p.id AS productId, p.name AS productName, p.boxesPerCarton AS boxesPerCarton,
                COALESCE((SELECT m.newQuantity FROM stock_movements m
                          WHERE m.productId = p.id ORDER BY m.id DESC LIMIT 1), 0) AS remaining
         FROM products p
         ORDER BY remaining DESC, p.name ASC`
      )
      .all() as ProductRemainingRow[]
  }

  recentProducts(limit: number): Product[] {
    return this.db
      .prepare('SELECT * FROM products ORDER BY createdAt DESC, id DESC LIMIT ?')
      .all(limit) as Product[]
  }

  recentCustomers(limit: number): CustomerWithRoute[] {
    return this.db
      .prepare(
        `SELECT c.*, r.name AS routeName
         FROM customers c
         JOIN routes r ON r.id = c.routeId
         ORDER BY c.createdAt DESC, c.id DESC
         LIMIT ?`
      )
      .all(limit) as CustomerWithRoute[]
  }

  expensesFrom(from: string): Expense[] {
    return this.db
      .prepare('SELECT * FROM expenses WHERE date >= ? ORDER BY date ASC, id ASC')
      .all(from) as Expense[]
  }

  expensesInRange(from: string, to: string): Expense[] {
    return this.db
      .prepare('SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC')
      .all(from, to) as Expense[]
  }

  /** Payments received inside the range, with the customer and invoice they settled. */
  paymentsInRange(from: string, to: string): CashInward[] {
    return this.db
      .prepare(
        `SELECT p.id AS paymentId, p.date, p.amount,
                c.shopName AS customerName, i.invoiceNumber
         FROM payments p
         JOIN invoices i ON i.id = p.invoiceId
         JOIN customers c ON c.id = p.customerId
         WHERE p.date >= ? AND p.date <= ?
         ORDER BY p.date DESC, p.id DESC`
      )
      .all(from, to) as CashInward[]
  }

  /** Every open (unpaid/partial) invoice's remaining balance, summed per customer. */
  outstandingByCustomer(): CustomerOwed[] {
    return this.db
      .prepare(
        `SELECT c.id AS customerId, c.shopName AS customerName,
                COUNT(i.id) AS openInvoices,
                SUM(i.grandTotal - i.paidAmount) AS owed
         FROM invoices i
         JOIN customers c ON c.id = i.customerId
         WHERE i.status != 'cancelled' AND i.grandTotal > i.paidAmount
         GROUP BY c.id, c.shopName
         HAVING SUM(i.grandTotal - i.paidAmount) > 0
         ORDER BY owed DESC, c.shopName ASC`
      )
      .all() as CustomerOwed[]
  }

  /** Products dispatched by the invoices dated on the given day (billed amounts). */
  dispatchedToday(date: string): TodayDispatch[] {
    return this.db
      .prepare(
        `SELECT ii.productId, p.name AS productName,
                SUM(ii.cartonCount + ii.boxCount) AS quantity,
                SUM(ii.amount) AS amount
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoiceId
         JOIN products p ON p.id = ii.productId
         WHERE i.date = ? AND i.status != 'cancelled'
         GROUP BY ii.productId, p.name
         ORDER BY quantity DESC, p.name ASC`
      )
      .all(date) as TodayDispatch[]
  }
}