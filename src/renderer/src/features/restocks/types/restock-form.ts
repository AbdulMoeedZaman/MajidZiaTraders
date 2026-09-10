import type { Restock } from '@shared/types/restock'
import { localDate } from '@shared/date'

export type RestockFilter = 'all' | 'pending' | 'received' | 'cancelled'

export interface RestockItemInput {
  productId: string
  unit: string
  quantity: string
  unitCost: string
}

export interface RestockFormState {
  supplierName: string
  date: string
  notes: string
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
    items: [],
  }
}