import type { ProjectOwner } from './project-owner'
import type { Broker } from './broker'
import type { Customer } from './customer'

export type FilerStatus = 'filer' | 'non_filer'

export type InvoiceStatus = 'unpaid' | 'paid' | 'partial' | 'cancelled'

export interface Invoice {
  id: number
  invoiceNumber: string
  customerId: number
  ownerId: number
  brokerId: number
  date: string
  /** Customer filer status: filer or non filer. */
  filerStatus: FilerStatus
  /** Sum of all line amounts (system calculated). */
  subtotal: number
  /** Manually entered "remaining amount" (minor units). Blank when null. */
  remaining: number | null
  /** Manually entered tax (minor units). Blank when null. */
  tax: number | null
  /** Manually entered grand total (minor units). Blank when null. */
  grandTotal: number | null
  /** Payment status: paid, unpaid, part-paid or cancelled. */
  status: InvoiceStatus
  /** Total recorded payments (minor units); 0 for unpaid/cancelled invoices. */
  paidAmount: number
  createdAt: string
  updatedAt: string
}

/** The full amount owed on an invoice (grand total, else subtotal). */
export function invoiceDue(invoice: Pick<Invoice, 'grandTotal' | 'subtotal'>): number {
  return invoice.grandTotal ?? invoice.subtotal
}

/** The amount still owed on an invoice (due minus payments, never below zero). */
export function invoiceRemaining(invoice: Pick<Invoice, 'grandTotal' | 'subtotal' | 'paidAmount'>): number {
  return Math.max(0, invoiceDue(invoice) - invoice.paidAmount)
}

export interface InvoiceItem {
  id: number
  invoiceId: number
  productId: number
  /** Snapshot of the product name at sale time. */
  productName: string
  /** Entered rate per carton (minor units), >= the product floor. */
  rate: number
  /** The product's minimum rate snapshot (the floor this line respected). */
  minRate: number
  /** Snapshot of the product's boxes-per-carton. */
  piecesPerCarton: number
  cartonCount: number
  boxCount: number
  /** Computed line amount (minor units). */
  amount: number
  createdAt: string
}

export interface CreateInvoiceItemDTO {
  productId: number
  /** Rate per carton in minor units, must be >= the product's minimum rate. */
  rate: number
  /**
   * Whole cartons on the line. When provided together with boxCount these are
   * stored as entered (overflow pieces are carried into whole cartons).
   */
  cartonCount?: number
  /** Loose pieces on the line (not forming a full carton). */
  boxCount?: number
  /**
   * Legacy fallback: total quantity in pieces; the system splits it into
   * cartons + loose pieces canonically when cartonCount/boxCount are not given.
   */
  quantity?: number
}

export interface CreateInvoiceDTO {
  customerId: number
  brokerId: number
  date: string
  filerStatus: FilerStatus
  /** Manually entered tax (minor units). Blank when null. */
  tax?: number | null
  items: CreateInvoiceItemDTO[]
}

export interface InvoiceWithCustomer extends Invoice {
  /** Customer shop name. */
  customerName: string
  customerCode: string
}

export interface InvoiceWithItems extends InvoiceWithCustomer {
  items: InvoiceItem[]
}

/** Everything the invoice detail / print view needs, resolved in one call. */
export interface InvoiceDetails {
  invoice: InvoiceWithItems
  customer: Customer | null
  owner: ProjectOwner | null
  broker: Broker | null
}

/** A product line aggregated across the invoices in a load form. */
export interface LoadFormProductLine {
  productId: number
  productName: string
  /** Combined carton count across all selected invoices (canonical composition). */
  cartonCount: number
  /** Combined loose-piece count across all selected invoices (canonical composition). */
  boxCount: number
  /** Total quantity across all selected invoices, in pieces (cartons × piecesPerCarton + boxCount). */
  totalQuantity: number
}

/** A customer aggregated across the invoices in a load form. */
export interface LoadFormCustomerLine {
  customerId: number
  customerName: string
  /** Sum of that customer's invoice amounts (grand total, else subtotal) in minor units. */
  amount: number
}

/** Aggregate used by the printable load form report. */
export interface LoadFormSummary {
  invoiceNumbers: string[]
  products: LoadFormProductLine[]
  customers: LoadFormCustomerLine[]
  grandTotal: number
}