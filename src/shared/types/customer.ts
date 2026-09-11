export interface Customer {
  id: number
  name: string
  phone: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateCustomerDTO {
  name: string
  phone?: string | null
}

export interface UpdateCustomerDTO {
  name?: string
  phone?: string | null
}

export interface CustomerLedgerTotals {
  totalDebit: number
  totalCredit: number
}

export interface CustomerWithBalance extends Customer, CustomerLedgerTotals {
  balance: number
  outstanding: number
}
