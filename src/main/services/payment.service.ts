import { PaymentRepository } from '../repositories/payment.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import { localDate } from '@shared/date'
import { invoiceDue, invoiceRemaining } from '@shared/types/invoice'
import type { Invoice, InvoiceStatus } from '@shared/types/invoice'
import type { CustomerPayResult, Payment, PaymentApplication } from '@shared/types/payment'

/**
 * Records payments and derives the invoice's payment status.
 *
 * A single-invoice payment (`payInvoice`) settles the exact amount entered against
 * one invoice. A customer payment (`payCustomer`) applies the entered amount across
 * the customer's open invoices, oldest first, rolling any surplus over to the next
 * invoice. The stored `status` is always derived: paid when payments cover the due
 * amount, partial when anything has been received, unpaid otherwise.
 */
export class PaymentService {
  private paymentRepo = new PaymentRepository()
  private invoiceRepo = new InvoiceRepository()

  payInvoice(invoiceId: number, amount: number): Invoice {
    this.assertPaymentAmount(amount)
    const invoice = this.invoiceRepo.findById(invoiceId)
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    if (invoice.status === 'cancelled') {
      throw new Error('A cancelled invoice cannot be paid')
    }
    if (invoice.status === 'paid') {
      throw new Error('Invoice is already fully paid')
    }

    const remaining = invoiceRemaining(invoice)
    if (amount > remaining) {
      throw new Error('Payment exceeds the remaining balance of the invoice')
    }

    return this.paymentRepo.runInTransaction(() => {
      const payment = this.paymentRepo.insert({
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        amount,
        date: localDate(),
        note: null,
      })
      void payment
      const paidAmount = invoice.paidAmount + amount
      const status = newStatus(paidAmount, invoiceDue(invoice))
      this.invoiceRepo.updatePaymentState(invoice.id, paidAmount, status)
      return this.invoiceRepo.findById(invoice.id)!
    })
  }

  payCustomer(customerId: number, amount: number): CustomerPayResult {
    this.assertPaymentAmount(amount)
    const open = this.paymentRepo.findOpenByCustomer(customerId)
    if (open.length === 0) {
      throw new Error('This customer has no open invoice to pay')
    }

    const totalRemaining = open.reduce((sum, inv) => sum + invoiceRemaining(inv), 0)
    if (amount > totalRemaining) {
      throw new Error('Payment exceeds this customer\u2019s total outstanding balance')
    }

    let left = amount
    const applied: PaymentApplication[] = []

    this.paymentRepo.runInTransaction(() => {
      for (const inv of open) {
        if (left <= 0) break
        const next = invoiceRemaining(inv)
        if (next <= 0) continue
        const take = Math.min(next, left)
        this.paymentRepo.insert({
          invoiceId: inv.id,
          customerId,
          amount: take,
          date: localDate(),
          note: null,
        })
        const paidAmount = inv.paidAmount + take
        const status = newStatus(paidAmount, invoiceDue(inv))
        this.invoiceRepo.updatePaymentState(inv.id, paidAmount, status)
        applied.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: take, status })
        left -= take
      }
    })

    return { applied, total: amount }
  }

  listByInvoice(invoiceId: number): Payment[] {
    return this.paymentRepo.findByInvoice(invoiceId)
  }

  listByCustomer(customerId: number): Payment[] {
    return this.paymentRepo.findByCustomer(customerId)
  }

  private assertPaymentAmount(amount: number): void {
    if (!Number.isInteger(amount)) {
      throw new Error('Payment amount must be a whole number of paisa')
    }
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero')
    }
  }
}

function newStatus(paidAmount: number, due: number): InvoiceStatus {
  if (paidAmount >= due) return 'paid'
  if (paidAmount > 0) return 'partial'
  return 'unpaid'
}