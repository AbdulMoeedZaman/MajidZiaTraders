import type { Invoice } from '@shared/types/invoice'
import { localDate } from '@shared/date'

export type InvoiceStatusFilter = 'all' | Invoice['status']

export interface InvoiceItemInput {
  productId: string
  quantity: string
  sellingPrice: string
}

export interface InvoiceFormState {
  customerId: string
  date: string
  dueDate: string
  discount: string
  notes: string
  items: InvoiceItemInput[]
}

export const INVOICE_STATUS_LABELS: Record<Invoice['status'], string> = {
  sent: 'Sent',
  paid: 'Paid',
  partial: 'Partially paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

export const INVOICE_STATUS_FILTERS: InvoiceStatusFilter[] = [
  'all',
  'sent',
  'partial',
  'paid',
  'overdue',
  'cancelled',
]

export function defaultInvoiceFormState(): InvoiceFormState {
  return {
    customerId: '',
    date: localDate(),
    dueDate: '',
    discount: '0',
    notes: '',
    items: [],
  }
}

export function moneyToCents(value: string): number {
  const parsed = parseFloat(value || '0')
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.round(parsed * 100))
}