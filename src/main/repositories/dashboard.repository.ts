import { BaseRepository } from './base.repository'
import type { Product } from '@shared/types/product'
import type { CustomerWithRoute } from '@shared/types/customer'
import type { Expense } from '@shared/types/expense'

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
         WHERE i.date >= ? AND i.date <= ?
         ORDER BY i.date DESC, i.id DESC`
      )
      .all(from, to) as ProfitLineRow[]
  }

  /** Every product's current stock level (latest ledger running balance). */
  remainingPerProduct(): ProductRemainingRow[] {
    return this.db
      .prepare(
        `SELECT p.id AS productId, p.name AS productName,
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
}