import type { InvoiceWithCustomer } from './invoice'
import type { Product } from './product'
import type { CustomerWithRoute } from './customer'
import type { ExpenseDaySummary } from './expense'

/** Profit a single customer generated in the selected period (minor units). */
export interface CustomerProfit {
  customerId: number
  customerName: string
  /** Number of invoices the customer had inside the selected date range. */
  invoices: number
  /** Sum of the customer's line profits; always non-zero. */
  profit: number
}

/** Current stock level of one product (latest ledger running balance). */
export interface ProductRemaining {
  productId: number
  productName: string
  remaining: number
}

export interface DashboardSummary {
  range: { start: string; end: string }
  profit: {
    total: number
    perCustomer: CustomerProfit[]
  }
  stock: {
    total: number
    perProduct: ProductRemaining[]
  }
  invoices: {
    total: number
    list: InvoiceWithCustomer[]
  }
  expenses: {
    /** Total spent today (always today, regardless of the picker range). */
    todayTotal: number
    /** Total spent inside the selected date range. */
    total: number
    /** Expenses inside the range, grouped per day (newest day first). */
    byDay: ExpenseDaySummary[]
  }
  recent: {
    products: Product[]
    invoices: InvoiceWithCustomer[]
    customers: CustomerWithRoute[]
  }
}