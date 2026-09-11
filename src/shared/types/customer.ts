export interface Customer {
  id: number
  name: string
  address: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateCustomerDTO {
  name: string
  address?: string | null
}

export interface UpdateCustomerDTO {
  name?: string
  address?: string | null
}

export interface CustomerLedgerTotals {
  totalDebit: number
  totalCredit: number
}

export interface CustomerWithBalance extends Customer, CustomerLedgerTotals {
  balance: number
  outstanding: number
}
