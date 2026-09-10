import { PaymentRepository } from '../repositories/payment.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'

/**
 * Applies customer money to invoices. A payment's unapplied part is customer credit;
 * credit is always used on the customer's oldest open invoices first.
 * Callers must run these inside their own transaction.
 */
export class AllocationService {
  private paymentRepo = new PaymentRepository()
  private invoiceRepo = new InvoiceRepository()

  /** Applies whatever part of a payment is not yet applied to the customer's open invoices. Returns touched invoice ids. */
  applyUnallocated(paymentId: number, customerId: number): number[] {
    let remaining = this.paymentRepo.getUnallocatedAmount(paymentId)
    const touched: number[] = []
    if (remaining <= 0) return touched

    for (const invoice of this.invoiceRepo.findOpenInvoicesForCustomer(customerId)) {
      if (remaining <= 0) break
      const amount = Math.min(remaining, invoice.outstanding)
      if (amount <= 0) continue
      this.paymentRepo.allocate(paymentId, invoice.id, amount)
      this.invoiceRepo.recomputePaymentState(invoice.id)
      this.invoiceRepo.assertConsistency(invoice.id)
      remaining -= amount
      touched.push(invoice.id)
    }
    return touched
  }

  /** Uses the customer's existing credit (unapplied payments, oldest first) to pay down one invoice. */
  applyCreditToInvoice(invoiceId: number, customerId: number): void {
    for (const credit of this.paymentRepo.findPaymentsWithUnallocated(customerId)) {
      const invoice = this.invoiceRepo.findById(invoiceId)
      if (!invoice || invoice.outstanding <= 0) break
      const amount = Math.min(credit.unallocated, invoice.outstanding)
      if (amount <= 0) continue
      this.paymentRepo.allocate(credit.id, invoiceId, amount)
      this.invoiceRepo.recomputePaymentState(invoiceId)
    }
    this.invoiceRepo.assertConsistency(invoiceId)
  }
}
