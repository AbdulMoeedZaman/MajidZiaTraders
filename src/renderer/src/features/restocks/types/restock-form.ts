import type { Restock } from '@shared/types/restock'
import { localDate } from '@shared/date'

export type RestockFilter = 'all' | 'pending' | 'received' | 'cancelled'

export interface RestockItemInput {
  productId: string
  qtyCartons: string
  piecesPerCarton: string
  mrpPerPiece: string
  netSalesValueExcl: string
  tradeDiscountValue: string
  salesTaxRate: string
  advanceTaxRate: string
}

export interface RestockFormState {
  supplierName: string
  date: string
  notes: string
  supplierInvoiceNo: string
  supplierRegistrationNo: string
  buyerNtn: string
  buyerCnic: string
  dispatchNoteNo: string
  salesOrderNo: string
  items: RestockItemInput[]
}

export const RESTOCK_STATUS_LABELS: Record<Restock['status'], string> = {
  pending: 'Pending',
  received: 'Received',
  cancelled: 'Cancelled',
}

export function defaultRestockFormState(): RestockFormState {
  return {
    supplierName: '',
    date: localDate(),
    notes: '',
    supplierInvoiceNo: '',
    supplierRegistrationNo: '',
    buyerNtn: '',
    buyerCnic: '',
    dispatchNoteNo: '',
    salesOrderNo: '',
    items: [],
  }
}

export function defaultRestockItemInput(): RestockItemInput {
  return {
    productId: '',
    qtyCartons: '1',
    piecesPerCarton: '1',
    mrpPerPiece: '',
    netSalesValueExcl: '',
    tradeDiscountValue: '0',
    salesTaxRate: '',
    advanceTaxRate: '',
  }
}