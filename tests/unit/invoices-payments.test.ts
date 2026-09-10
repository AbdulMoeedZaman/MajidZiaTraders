import { describe, expect, it } from 'vitest'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { PaymentService } from '../../src/main/services/payment.service'
import { CustomerService } from '../../src/main/services/customer.service'
import { BusinessProfileService } from '../../src/main/services/business-profile.service'
import { InvoiceRepository } from '../../src/main/repositories/invoice.repository'
import { getDatabase } from '../../src/main/database/connection'
import { localDate } from '../../src/shared/date'
import { line, seedBasics, useTestDatabase } from './helpers'

useTestDatabase()
const TODAY = localDate()

describe('invoices', () => {
  it('rejects a discount larger than the subtotal', () => {
    const { product, customerId } = seedBasics()
    expect(() =>
      new InvoiceService().create({ customerId, date: TODAY, discount: 999999, items: [line(product, 1)] })
    ).toThrow(/larger than the invoice subtotal/)
  })

  it('only lets the notes and due date change after an invoice is issued', () => {
    const { product, customerId } = seedBasics()
    const invoices = new InvoiceService()
    const invoice = invoices.create({ customerId, date: TODAY, items: [line(product, 1)] })

    expect(() => invoices.update(invoice.id, { discount: 500 })).toThrow(/Only the notes and due date/)
    expect(() => invoices.update(invoice.id, { customerId: 999 })).toThrow(/Only the notes and due date/)

    const updated = invoices.update(invoice.id, { notes: 'Deliver Monday', dueDate: '2020-01-01' })
    expect(updated.notes).toBe('Deliver Monday')
    expect(updated.status).toBe('overdue')
    expect(updated.total).toBe(invoice.total)
  })

  it('marks an invoice with a past due date as overdue as soon as it is created', () => {
    const { product, customerId } = seedBasics()
    const invoice = new InvoiceService().create({
      customerId,
      date: '2026-08-01',
      dueDate: '2026-08-10',
      items: [line(product, 1)],
    })
    expect(invoice.status).toBe('overdue')
  })

  it('keeps the customer ledger charge equal to the invoice total', () => {
    const { product, customerId } = seedBasics()
    const invoice = new InvoiceService().create({
      customerId,
      date: TODAY,
      taxRate: 10,
      discount: 1000,
      items: [line(product, 15)],
    })
    const debit = getDatabase()
      .prepare("SELECT debit FROM customer_ledger WHERE referenceType = 'invoice' AND referenceId = ?")
      .get(invoice.id) as { debit: number }
    expect(invoice.total).toBe(15400)
    expect(debit.debit).toBe(invoice.total)
  })

  it('numbers the first invoice INV-000001', () => {
    const { product, customerId } = seedBasics()
    const invoice = new InvoiceService().create({ customerId, date: TODAY, items: [line(product, 1)] })
    expect(invoice.invoiceNumber).toBe('INV-000001')
  })

  it('rejects an impossible calendar date', () => {
    const { product, customerId } = seedBasics()
    expect(() =>
      new InvoiceService().create({ customerId, date: '2026-02-31', items: [line(product, 1)] })
    ).toThrow(/not a valid date/)
  })
})

describe('payments and customer credit', () => {
  it('applies a payment without an invoice to the oldest open invoice and lists it there', () => {
    const { product, customerId } = seedBasics()
    const invoices = new InvoiceService()
    const payments = new PaymentService()
    const older = invoices.create({ customerId, date: '2026-09-01', items: [line(product, 1)] })
    const newer = invoices.create({ customerId, date: TODAY, items: [line(product, 1)] })

    const payment = payments.create({ customerId, amount: 1500, method: 'cash', paymentDate: TODAY })

    expect(new InvoiceRepository().findById(older.id)).toMatchObject({ paid: 1000, outstanding: 0, status: 'paid' })
    expect(new InvoiceRepository().findById(newer.id)).toMatchObject({ paid: 500, outstanding: 500 })
    const onNewer = payments.listByInvoice(newer.id)
    expect(onNewer).toHaveLength(1)
    expect(onNewer[0]).toMatchObject({ id: payment.id, appliedAmount: 500, allocationCount: 2 })
    expect(payments.list().find((p) => p.id === payment.id)?.invoiceNumber).toContain(older.invoiceNumber)
  })

  it("uses the customer's credit on their next invoice", () => {
    const { product, customerId } = seedBasics()
    new PaymentService().create({ customerId, amount: 700, method: 'cash', paymentDate: TODAY })

    const invoice = new InvoiceService().create({ customerId, date: TODAY, items: [line(product, 1)] })
    const customer = new CustomerService().getWithBalance(customerId)!

    expect(invoice).toMatchObject({ total: 1000, paid: 700, outstanding: 300, status: 'partial' })
    expect(customer.balance).toBe(300)
  })

  it('returns applied credit to the customer when the invoice is cancelled', () => {
    const { product, customerId } = seedBasics()
    new PaymentService().create({ customerId, amount: 700, method: 'cash', paymentDate: TODAY })
    const invoices = new InvoiceService()
    const invoice = invoices.create({ customerId, date: TODAY, items: [line(product, 1)] })

    const cancelled = invoices.cancel(invoice.id)
    expect(cancelled.status).toBe('cancelled')
    expect(new CustomerService().getWithBalance(customerId)!.balance).toBe(-700)

    // The credit is available again for the next invoice.
    const next = invoices.create({ customerId, date: TODAY, items: [line(product, 1)] })
    expect(next.paid).toBe(700)
  })

  it('refuses to cancel an invoice that has a payment recorded against it', () => {
    const { product, customerId } = seedBasics()
    const invoices = new InvoiceService()
    const invoice = invoices.create({ customerId, date: TODAY, items: [line(product, 1)] })
    new PaymentService().create({ customerId, invoiceId: invoice.id, amount: 100, method: 'card', paymentDate: TODAY })
    expect(() => invoices.cancel(invoice.id)).toThrow(/payments recorded against it/)
  })

  it('rejects overpaying an invoice and recomputes the invoice when a payment is deleted', () => {
    const { product, customerId } = seedBasics()
    const invoice = new InvoiceService().create({ customerId, date: TODAY, items: [line(product, 1)] })
    const payments = new PaymentService()
    expect(() =>
      payments.create({ customerId, invoiceId: invoice.id, amount: 1001, method: 'cash', paymentDate: TODAY })
    ).toThrow(/exceeds the invoice outstanding/)

    const payment = payments.create({ customerId, invoiceId: invoice.id, amount: 1000, method: 'cash', paymentDate: TODAY })
    expect(new InvoiceRepository().findById(invoice.id)?.status).toBe('paid')
    payments.delete(payment.id)
    expect(new InvoiceRepository().findById(invoice.id)).toMatchObject({ paid: 0, outstanding: 1000, status: 'sent' })
  })

  it("reapplies the customer's leftover credit when a payment is deleted", () => {
    const { product, customerId } = seedBasics()
    const invoices = new InvoiceService()
    const payments = new PaymentService()
    const invoice = invoices.create({ customerId, date: TODAY, items: [line(product, 1)] })
    const covering = payments.create({
      customerId,
      invoiceId: invoice.id,
      amount: 1000,
      method: 'cash',
      paymentDate: TODAY,
    })
    payments.create({ customerId, amount: 400, method: 'cash', paymentDate: TODAY })

    payments.delete(covering.id)

    expect(new InvoiceRepository().findById(invoice.id)).toMatchObject({ paid: 400, outstanding: 600, status: 'partial' })
    expect(new CustomerService().getWithBalance(customerId)!.balance).toBe(600)
  })
})

describe('customers and profile', () => {
  it('clears optional fields when they are sent as null', () => {
    const customers = new CustomerService()
    const created = customers.create({ name: 'Pat', phone: '5551234567', email: 'pat@example.com' })
    const updated = customers.update(created.id, { phone: null, email: null })
    expect(updated.phone).toBeNull()
    expect(updated.email).toBeNull()
  })

  it('rejects a NaN tax rate and a non-integer next invoice number', () => {
    const profiles = new BusinessProfileService()
    expect(() => profiles.update({ name: 'Shop', taxRate: Number.NaN })).toThrow(/Tax rate/)
    profiles.update({ name: 'Shop', taxRate: 5, invoiceNextNumber: 1 })
    expect(() => profiles.update({ invoiceNextNumber: 1.5 })).toThrow(/Invoice next number/)
  })
})
