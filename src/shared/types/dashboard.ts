import type { InvoiceWithCustomer } from './invoice'
import type { CustomerPaymentWithCustomer } from './customer-payment'
import type { ProductWithStock } from './inventory'

export interface TodaySales {
  count: number
  revenue: number
  cost: number
  profit: number
}

export interface DashboardOverview {
  date: string
  today: TodaySales
  outstandingBalance: number
  totals: {
    customers: number
    products: number
    productsLowStock: number
    productsOutOfStock: number
  }
  recentInvoices: InvoiceWithCustomer[]
  recentPayments: CustomerPaymentWithCustomer[]
  lowStockItems: ProductWithStock[]
}