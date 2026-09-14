import { PaymentRepository } from '../repositories/payment.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { HistoryService } from './history.service'
import { localDate } from '@shared/date'
import { invoiceDue, invoiceRemaining } from '@shared/types/invoice'
import type { Invoice, InvoiceStatus } from '@shared/types/invoice'
import type { CustomerPayResult, Payment, PaymentApplication, RecentPayment } from '@shared/types/payment'

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
  private customerRepo = new CustomerRepository()
  private history = new HistoryService()

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
      const paidAmount = invoice.paidAmount + amount
      const status = newStatus(paidAmount, invoiceDue(invoice))
      this.invoiceRepo.updatePaymentState(invoice.id, paidAmount, status)
      this.history.append({
        action: 'payment_recorded',
        targetType: 'payment',
        targetId: payment.id,
        summary: `Received ${formatPaisa(amount)} for ${invoice.invoiceNumber}`,
        snapshot: { entries: [paymentToEntry(payment)] },
      })
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
    const entries: PaymentEntry[] = []

    this.paymentRepo.runInTransaction(() => {
      for (const inv of open) {
        if (left <= 0) break
        const next = invoiceRemaining(inv)
        if (next <= 0) continue
        const take = Math.min(next, left)
        const payment = this.paymentRepo.insert({
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
        entries.push(paymentToEntry(payment))
        left -= take
      }
    })

    const customer = this.customerRepo.findById(customerId)
    this.history.append({
      action: 'payment_recorded',
      targetType: 'payment',
      targetId: entries[0]?.id ?? null,
      summary: `Received ${formatPaisa(amount)} from ${customer?.shopName || customer?.ownerName || 'customer'}`,
      snapshot: { entries },
    })

    return { applied, total: amount }
  }

  listByInvoice(invoiceId: number): Payment[] {
    return this.paymentRepo.findByInvoice(invoiceId)
  }

  listByCustomer(customerId: number): Payment[] {
    return this.paymentRepo.findByCustomer(customerId)
  }

  /** Newest payments with their invoice / customer context (adjustments screen). */
  listRecent(limit = 50): RecentPayment[] {
    return this.paymentRepo.findRecent(limit)
  }

  /**
   * Reverses a mistaken payment: deletes the payment row and recomputes the
   * invoice's paid amount + status from whatever payments remain.
   */
  removePayment(paymentId: number): Payment {
    return this.paymentRepo.runInTransaction(() => {
      const payment = this.paymentRepo.findById(paymentId)
      if (!payment) {
        throw new Error('Payment not found')
      }
      this.paymentRepo.deleteById(payment.id)
      this.refreshInvoicePaymentState(payment.invoiceId)
      this.history.append({
        action: 'payment_reversed',
        targetType: 'payment',
        targetId: payment.id,
        summary: `Removed ${formatPaisa(payment.amount)} received against invoice ${this.invoiceNumber(payment.invoiceId)}`,
        snapshot: { entries: [paymentToEntry(payment)] },
      })
      return payment
    })
  }

  private invoiceNumber(invoiceId: number): string {
    const invoice = this.invoiceRepo.findById(invoiceId)
    return invoice?.invoiceNumber ?? `#${invoiceId}`
  }

  /** Re-derives an invoice's paid amount and status from the payments that remain. */
  private refreshInvoicePaymentState(invoiceId: number): void {
    const invoice = this.invoiceRepo.findById(invoiceId)
    if (!invoice || invoice.status === 'cancelled') return
    const paid = this.paymentRepo.sumByInvoice(invoiceId)
    const due = invoiceDue(invoice)
    this.invoiceRepo.updatePaymentState(invoiceId, paid, newStatus(paid, due))
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

/** The fields HistoryService needs to reverse / replay a recorded payment. */
interface PaymentEntry {
  id: number
  invoiceId: number
  customerId: number
  amount: number
  date: string
  note: string | null
  createdAt: string
}

function paymentToEntry(payment: Payment): PaymentEntry {
  return {
    id: payment.id,
    invoiceId: payment.invoiceId,
    customerId: payment.customerId,
    amount: payment.amount,
    date: payment.date,
    note: payment.note,
    createdAt: payment.createdAt,
  }
}

function formatPaisa(cents: number): string {
  return `Rs. ${(cents / 100).toFixed(2)}`
}