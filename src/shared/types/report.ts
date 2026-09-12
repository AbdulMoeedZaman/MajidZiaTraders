import type { CustomerPayment } from './customer-payment'
import type { Restock } from './restock'

export interface SalesReportItem {
  productId: number
  productName: string
  productSku: string
  quantitySold: number
  revenue: number
  cost: number
  profit: number
}

export interface SalesReport {
  period: { from: string; to: string }
  totalRevenue: number
  totalCost: number
  totalProfit: number
  totalInvoices: number
  totalCustomers: number
  items: SalesReportItem[]
}

export interface InventoryReportItem {
  productId: number
  productName: string
  productSku: string
  currentQuantity: number
  price: number
  totalValue: number
  costValue: number
}

export interface InventoryReport {
  generatedAt: string
  totalProducts: number
  totalValue: number
  items: InventoryReportItem[]
}

export interface CustomerReportItem {
  customerId: number
  customerName: string
  periodPurchases: number
  periodPayments: number
  totalPurchases: number
  totalPayments: number
  outstandingBalance: number
}

export interface CustomerReport {
  period: { from: string; to: string }
  totalCustomers: number
  totalPurchases: number
  totalPayments: number
  totalOutstanding: number
  items: CustomerReportItem[]
}

export interface ProfitLossReport {
  period: { from: string; to: string }
  totalRevenue: number
  totalCostOfGoods: number
  grossProfit: number
  expenses: number
  netProfit: number
  profitMargin: number
}

export interface PaymentReportItem {
  paymentId: number
  date: string
  customerId: number
  customerName: string
  invoiceId: number | null
  invoiceNumber: string | null
  amount: number
  method: CustomerPayment['method']
  reference: string | null
}

export interface PaymentsReport {
  period: { from: string; to: string }
  totalAmount: number
  totalCount: number
  byMethod: Array<{ method: string; amount: number; count: number }>
  items: PaymentReportItem[]
}

export interface RestockReportItem {
  restockId: number
  referenceNumber: string
  supplierName: string
  date: string
  itemCount: number
  totalCost: number
  status: Restock['status']
}

export interface RestocksReport {
  period: { from: string; to: string }
  totalCost: number
  receivedCost: number
  totalCount: number
  receivedCount: number
  items: RestockReportItem[]
}

export interface StockMovementReportItem {
  movementId: number
  date: string
  productId: number
  productName: string
  productSku: string
  type: string
  quantity: number
  referenceType: string | null
  referenceId: number | null
  reason: string | null
  newQuantity: number
  cost: number | null
}

export interface StockMovementsReport {
  period: { from: string; to: string }
  inbound: number
  inboundValue: number
  outbound: number
  items: StockMovementReportItem[]
}

export interface ReportPeriod {
  from: string
  to: string
}
