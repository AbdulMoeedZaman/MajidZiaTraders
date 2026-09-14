import type { InvoiceStatus } from './invoice'

/** One recorded payment against an invoice (customerId denormalised). */
export interface Payment {
  id: number
  invoiceId: number
  customerId: number
  /** Amount received, in minor units (whole paisa). */
  amount: number
  /** Business date the payment was recorded (YYYY-MM-DD). */
  date: string
  note: string | null
  createdAt: string
  updatedAt: string
}

/** A single settlement produced by a customer payment, applied oldest invoice first. */
export interface PaymentApplication {
  invoiceId: number
  invoiceNumber: string
  amount: number
  status: InvoiceStatus
}

export interface CustomerPayResult {
  /** The payments actually recorded, one per invoice touched. */
  applied: PaymentApplication[]
  /** Sum of the applied payments (always equals the amount entered). */
  total: number
}

/** A payment shown on the adjustments screen, with invoice / customer context. */
export interface RecentPayment extends Payment {
  invoiceNumber: string
  customerName: string
}