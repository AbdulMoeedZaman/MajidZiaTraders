export { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@shared/types/customer-payment'
export type { CustomerPayment } from '@shared/types/customer-payment'
import { localDate } from '@shared/date'

export interface PaymentFormState {
  customerId: string
  invoiceId: string
  amount: string
  method: 'cash' | 'bank_transfer' | 'card' | 'check' | 'other'
  paymentDate: string
  reference: string
  notes: string
}

export function defaultPaymentFormState(): PaymentFormState {
  return {
    customerId: '',
    invoiceId: '',
    amount: '',
    method: 'cash',
    paymentDate: localDate(),
    reference: '',
    notes: '',
  }
}