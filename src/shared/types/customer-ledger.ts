export type LedgerEntryType = 'invoice' | 'payment' | 'credit_note' | 'adjustment'

export interface CustomerLedgerEntry {
  id: number
  customerId: number
  type: LedgerEntryType
  referenceType: string | null
  referenceId: number | null
  debit: number
  credit: number
  description: string | null
  transactionDate: string
  createdAt: string
}

export interface CreateCustomerLedgerDTO {
  customerId: number
  type: LedgerEntryType
  referenceType?: string
  referenceId?: number
  debit?: number
  credit?: number
  description?: string
  transactionDate?: string
}

export interface CustomerLedgerQuery {
  customerId: number
  from?: string
  to?: string
  limit?: number
}

export interface CustomerLedgerEntryWithBalance extends CustomerLedgerEntry {
  runningBalance: number
}

export interface CustomerLedgerSummary {
  customerId: number
  totalDebit: number
  totalCredit: number
  balance: number
  outstanding: number
  entryCount: number
}

export const LEDGER_ENTRY_TYPES: LedgerEntryType[] = [
  'invoice',
  'payment',
  'credit_note',
  'adjustment',
]