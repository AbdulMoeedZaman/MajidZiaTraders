import type { Customer, CreateCustomerDTO } from '@shared/types/customer'
import type { LedgerEntryType } from '@shared/types/customer-ledger'

export type CustomerFormMode = 'create' | 'edit'

export interface CustomerFormState {
  name: string
  address: string
}

export function toCustomerFormState(customer: Customer | null): CustomerFormState {
  return {
    name: customer?.name ?? '',
    address: customer?.address ?? '',
  }
}

export function fromCustomerFormState(state: CustomerFormState): CreateCustomerDTO {
  return {
    name: state.name.trim(),
    address: state.address.trim() || null,
  }
}

export const LEDGER_TYPE_LABELS: Record<LedgerEntryType, string> = {
  invoice: 'Invoice',
  payment: 'Payment',
  credit_note: 'Credit note',
  adjustment: 'Adjustment',
}