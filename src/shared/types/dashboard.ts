import type { InvoiceWithCustomer } from './invoice'
import type { Product } from './product'
import type { CustomerWithRoute } from './customer'

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
  recent: {
    products: Product[]
    invoices: InvoiceWithCustomer[]
    customers: CustomerWithRoute[]
  }
}