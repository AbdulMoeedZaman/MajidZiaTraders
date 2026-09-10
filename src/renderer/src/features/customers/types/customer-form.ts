import type { Customer, CreateCustomerDTO } from '@shared/types/customer'
import type { LedgerEntryType } from '@shared/types/customer-ledger'

export type CustomerFormMode = 'create' | 'edit'

export interface CustomerFormState {
  name: string
  phone: string
  email: string
  address: string
  notes: string
}

export function toCustomerFormState(customer: Customer | null): CustomerFormState {
  return {
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    notes: customer?.notes ?? '',
  }
}

export function fromCustomerFormState(state: CustomerFormState): CreateCustomerDTO {
  return {
    name: state.name.trim(),
    phone: state.phone.trim() || null,
    email: state.email.trim() || null,
    address: state.address.trim() || null,
    notes: state.notes.trim() || null,
  }
}

export const LEDGER_TYPE_LABELS: Record<LedgerEntryType, string> = {
  invoice: 'Invoice',
  payment: 'Payment',
  credit_note: 'Credit note',
  adjustment: 'Adjustment',
}