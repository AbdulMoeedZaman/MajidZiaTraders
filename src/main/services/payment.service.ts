import { PaymentRepository } from '../repositories/payment.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { CustomerLedgerRepository } from '../repositories/customer-ledger.repository'
import { InvoiceRepository } from '../repositories/invoice.repository'
import { AllocationService } from './allocation.service'
import type { CustomerPayment, CustomerPaymentWithCustomer, CreateCustomerPaymentDTO } from '@shared/types/customer-payment'
import { PAYMENT_METHODS } from '@shared/types/customer-payment'
import { localDate, assertIsoDate } from '@shared/date'

export class PaymentService {
  private paymentRepo = new PaymentRepository()
  private customerRepo = new CustomerRepository()
  private ledgerRepo = new CustomerLedgerRepository()
  private invoiceRepo = new InvoiceRepository()
  private allocationService = new AllocationService()

  list(): CustomerPaymentWithCustomer[] {
    return this.paymentRepo.findAllWithDetails()
  }

  getById(id: number): CustomerPayment | null {
    return this.paymentRepo.findById(id)
  }

  listByCustomer(customerId: number): CustomerPaymentWithCustomer[] {
    return this.paymentRepo.findByCustomerIdWithDetails(customerId)
  }

  listByInvoice(invoiceId: number): CustomerPaymentWithCustomer[] {
    return this.paymentRepo.findByInvoiceIdWithDetails(invoiceId)
  }

  listBetween(from: string, to: string): CustomerPaymentWithCustomer[] {
    this.validateDate(from, 'From date')
    this.validateDate(to, 'To date')
    if (from > to) throw new Error('From date cannot be after to date')
    return this.paymentRepo.findAllWithDetails(from, to)
  }

  create(data: CreateCustomerPaymentDTO): CustomerPayment {
    const customer = this.customerRepo.findById(data.customerId)
    if (!customer) {
      throw new Error('Customer not found')
    }
    if (customer.isActive !== 1) {
      throw new Error(`Cannot record a payment for inactive customer "${customer.name}"`)
    }
    if (typeof data.amount !== 'number' || !Number.isInteger(data.amount) || data.amount <= 0) {
      throw new Error('Payment amount must be a positive whole number of cents')
    }
    if (!PAYMENT_METHODS.includes(data.method)) {
      throw new Error(`Invalid payment method: ${data.method}`)
    }
    const paymentDate = data.paymentDate ?? localDate()
    this.validateDate(paymentDate, 'Payment date')

    if (data.invoiceId) {
      const invoice = this.invoiceRepo.findById(data.invoiceId)
      if (!invoice) {
        throw new Error('Invoice not found')
      }
      if (invoice.customerId !== data.customerId) {
        throw new Error('Invoice does not belong to this customer')
      }
      if (invoice.status === 'cancelled') {
        throw new Error('Cannot record a payment against a cancelled invoice')
      }
      if (data.amount > invoice.outstanding) {
        throw new Error(
          `Payment amount (${data.amount} cents) exceeds the invoice outstanding (${invoice.outstanding} cents)`
        )
      }
    }

    return this.paymentRepo.runInTransaction(() => {
      const payment = this.paymentRepo.create({ ...data, paymentDate })

      this.ledgerRepo.create({
        customerId: data.customerId,
        type: 'payment',
        referenceType: 'customer_payment',
        referenceId: payment.id,
        credit: data.amount,
        description: data.invoiceId
          ? 'Payment for invoice'
          : `Payment received via ${data.method}`,
        transactionDate: paymentDate,
      })

      if (data.invoiceId) {
        this.paymentRepo.allocate(payment.id, data.invoiceId, data.amount)
        this.invoiceRepo.recomputePaymentState(data.invoiceId)
        this.invoiceRepo.assertConsistency(data.invoiceId)
      } else {
        this.allocationService.applyUnallocated(payment.id, data.customerId)
      }

      return payment
    })
  }

  delete(id: number): void {
    const existing = this.paymentRepo.findById(id)
    if (!existing) {
      throw new Error('Payment not found')
    }

    this.paymentRepo.runInTransaction(() => {
      const invoiceIds = this.paymentRepo.findAllocationInvoiceIds(id)
      this.ledgerRepo.deleteByReference('customer_payment', id)
      this.paymentRepo.deleteAllocationsByPayment(id)
      this.paymentRepo.delete(id)

      for (const invoiceId of invoiceIds) {
        this.invoiceRepo.recomputePaymentState(invoiceId)
        this.invoiceRepo.assertConsistency(invoiceId)
      }

      this.allocationService.applyCustomerCredit(existing.customerId)
    })
  }

  private validateDate(date: string, label: string): void {
    assertIsoDate(date, label)
  }

  count(): number {
    return this.paymentRepo.count()
  }
}
