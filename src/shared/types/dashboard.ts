import type { InvoiceWithCustomer } from './invoice'
import type { Product } from './product'
import type { CustomerWithRoute } from './customer'
import type { Expense, ExpenseDaySummary } from './expense'

/** Profit a single customer generated in the selected period (minor units). */
export interface CustomerProfit {
  customerId: number
  customerName: string
  /** Number of invoices the customer had inside the selected date range. */
  invoices: number
  /** Total the customer was billed inside the range (sales attribution). */
  sales: number
  /** Sum of the customer's line profits; always non-zero. */
  profit: number
}

/** Current stock level of one product (latest ledger running balance, in pieces). */
export interface ProductRemaining {
  productId: number
  productName: string
  /** Pieces per carton; together with `remaining` this yields whole cartons + loose pieces. */
  boxesPerCarton: number
  remaining: number
}

/** Total a customer still owes across every open (unpaid/partial) invoice. */
export interface CustomerOwed {
  customerId: number
  customerName: string
  /** Number of invoices with an outstanding balance. */
  openInvoices: number
  /** Sum of the unpaid balances (minor units). */
  owed: number
}

/** A single payment received inside the range (inward cash flow). */
export interface CashInward {
  paymentId: number
  date: string
  customerName: string
  invoiceNumber: string
  amount: number
}

/** A single unit a product was dispatched by today (sale ledger, today only). */
export interface TodayDispatch {
  productId: number
  productName: string
  /** Units dispatched today (cartons + boxes). */
  quantity: number
  /** Value of today's dispatches in minor units. */
  amount: number
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
    /** Products dispatched (sold) today, from the sale ledger. */
    dispatchedToday: TodayDispatch[]
  }
  expenses: {
    /** Total spent today (always today, regardless of the picker range). */
    todayTotal: number
    /** Total spent inside the selected date range. */
    total: number
    /** Expenses inside the range, grouped per day (newest day first). */
    byDay: ExpenseDaySummary[]
  }
  owed: {
    /** Still owed across every open invoice (never date-bounded). */
    total: number
    perCustomer: CustomerOwed[]
  }
  cashFlow: {
    inward: {
      /** Payments received inside the range. */
      total: number
      payments: CashInward[]
    }
    outward: {
      /** Expenses paid inside the range. */
      total: number
      expenses: Expense[]
    }
  }
  recent: {
    products: Product[]
    invoices: InvoiceWithCustomer[]
    customers: CustomerWithRoute[]
  }
}