import type { ProjectOwner } from './project-owner'
import type { Broker } from './broker'
import type { Customer } from './customer'

export type FilerStatus = 'filer' | 'non_filer'

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
  createdAt: string
  updatedAt: string
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
  boxesPerCarton: number
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
  cartonCount: number
  boxCount: number
}

export interface CreateInvoiceDTO {
  customerId: number
  brokerId: number
  date: string
  filerStatus: FilerStatus
  remaining?: number | null
  tax?: number | null
  grandTotal?: number | null
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