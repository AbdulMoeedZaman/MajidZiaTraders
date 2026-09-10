export interface CustomerPayment {
  id: number
  customerId: number
  invoiceId: number | null
  amount: number
  method: 'cash' | 'bank_transfer' | 'card' | 'check' | 'other'
  reference: string | null
  notes: string | null
  paymentDate: string
  createdAt: string
  updatedAt: string
}

export interface CreateCustomerPaymentDTO {
  customerId: number
  invoiceId?: number
  amount: number
  method: 'cash' | 'bank_transfer' | 'card' | 'check' | 'other'
  reference?: string
  notes?: string
  paymentDate?: string
}

export interface UpdateCustomerPaymentDTO {
  amount?: number
  method?: 'cash' | 'bank_transfer' | 'card' | 'check' | 'other'
  reference?: string
  notes?: string
}

export interface CustomerPaymentWithCustomer extends CustomerPayment {
  customerName: string
  /** Invoice number(s) this payment was applied to, comma-separated. */
  invoiceNumber: string | null
  /** Number of invoices the payment was applied to. */
  allocationCount?: number
  /** Part of the payment not applied to any invoice (customer credit). */
  unappliedAmount?: number
  /** Only when listing an invoice's payments: the amount applied to that invoice. */
  appliedAmount?: number
}

export interface PaymentAllocation {
  id: number
  paymentId: number
  invoiceId: number
  amount: number
  createdAt: string
}

export const PAYMENT_METHODS: CustomerPayment['method'][] = [
  'cash',
  'bank_transfer',
  'card',
  'check',
  'other',
]

export const PAYMENT_METHOD_LABELS: Record<CustomerPayment['method'], string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  check: 'Check',
  other: 'Other',
}
