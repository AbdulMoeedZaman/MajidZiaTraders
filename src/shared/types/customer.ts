export interface Customer {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  isActive: number
  createdAt: string
  updatedAt: string
}

export interface CreateCustomerDTO {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}

export interface UpdateCustomerDTO {
  name?: string
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  isActive?: number
}

export type CustomerStatusFilter = 'all' | 'active' | 'inactive'

export interface CustomerLedgerTotals {
  totalDebit: number
  totalCredit: number
}

export interface CustomerWithBalance extends Customer, CustomerLedgerTotals {
  balance: number
  outstanding: number
}