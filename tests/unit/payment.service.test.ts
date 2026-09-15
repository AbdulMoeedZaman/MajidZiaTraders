import { describe, expect, it } from 'vitest'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { PaymentService } from '../../src/main/services/payment.service'
import { StockService } from '../../src/main/services/stock.service'
import { DashboardService } from '../../src/main/services/dashboard.service'
import { useTestDatabase, seedStocked } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('PaymentService', () => {
  useTestDatabase()

  const seed = seedStocked

  const invoiceInput = (base: ReturnType<typeof seed>, over: Partial<CreateInvoiceDTO> = {}): CreateInvoiceDTO => ({
    customerId: base.customerId,
    brokerId: base.brokerId,
    date: '2026-09-10',
    filerStatus: 'filer',
    tax: null,
    items: [{ productId: base.product.id, rate: 500, quantity: 24 }],
    ...over,
  })

  it('a full payment marks the invoice paid and records the payment', () => {
    const inv = new InvoiceService().create(invoiceInput(seed()))
    const paid = new PaymentService().payInvoice(inv.id, 1000)

    expect(paid.status).toBe('paid')
    expect(paid.paidAmount).toBe(1000)

    const pays = new PaymentService().listByInvoice(inv.id)
    expect(pays).toHaveLength(1)
    expect(pays[0].amount).toBe(1000)
    expect(pays[0].invoiceId).toBe(inv.id)
  })

  it('a partial payment leaves the invoice partially paid and a second payment completes it', () => {
    const inv = new InvoiceService().create(invoiceInput(seed()))
    const payments = new PaymentService()

    const partial = payments.payInvoice(inv.id, 400)
    expect(partial.status).toBe('partial')
    expect(partial.paidAmount).toBe(400)

    const complete = payments.payInvoice(inv.id, 600)
    expect(complete.status).toBe('paid')
    expect(complete.paidAmount).toBe(1000)
    expect(payments.listByInvoice(inv.id)).toHaveLength(2)
  })

  it('rejects over-payment, invalid amounts, a missing invoice and paying a paid invoice', () => {
    const payments = new PaymentService()
    const inv = new InvoiceService().create(invoiceInput(seed()))

    expect(() => payments.payInvoice(inv.id, 1500)).toThrow(/exceeds the remaining balance/)
    expect(() => payments.payInvoice(inv.id, 0)).toThrow(/greater than zero/)
    expect(() => payments.payInvoice(inv.id, -5)).toThrow(/greater than zero/)
    expect(() => payments.payInvoice(inv.id, 10.5)).toThrow(/whole number/)
    expect(() => payments.payInvoice(99999, 100)).toThrow(/Invoice not found/)

    payments.payInvoice(inv.id, 1000)
    expect(() => payments.payInvoice(inv.id, 100)).toThrow(/already fully paid/)
  })

  it('applies a customer payment oldest invoice first, rolling the surplus over', () => {
    const base = seed()
    const invoices = new InvoiceService()
    // subtotal is 2*500 = 1000, so tax inflates the grand total up to the owed amount
    const oldest = invoices.create(invoiceInput(base, { tax: 4000 }))
    const newest = invoices.create(invoiceInput(base, { date: '2026-09-11', tax: 2000 }))

    const result = new PaymentService().payCustomer(base.customerId, 6000)

    expect(result.total).toBe(6000)
    expect(result.applied.map((a) => a.invoiceId)).toEqual([oldest.id, newest.id])
    expect(result.applied[0].amount).toBe(5000)
    expect(result.applied[0].status).toBe('paid')
    expect(result.applied[1].amount).toBe(1000)
    expect(result.applied[1].status).toBe('partial')

    const a = invoices.getById(oldest.id)!
    const b = invoices.getById(newest.id)!
    expect(a.status).toBe('paid')
    expect(a.paidAmount).toBe(5000)
    expect(b.status).toBe('partial')
    expect(b.paidAmount).toBe(1000)
  })

  it('rejects a customer payment above the total outstanding and with no open invoices', () => {
    const base = seed()
    const invoices = new InvoiceService()
    const payments = new PaymentService()

    expect(() => payments.payCustomer(base.customerId, 100)).toThrow(/no open invoice/)

    invoices.create(invoiceInput(base, { tax: 4000 }))
    expect(() => payments.payCustomer(base.customerId, 6000)).toThrow(/outstanding balance/)
    expect(() => payments.payCustomer(base.customerId, 0)).toThrow(/greater than zero/)
  })

  it('cancelling reverses payments, restocks the product and leaves a cancelled record', () => {
    const base = seed()
    const invoices = new InvoiceService()
    const payments = new PaymentService()
    const inv = invoices.create(invoiceInput(base))

    payments.payInvoice(inv.id, 400)

    const cancelled = invoices.cancel(inv.id)!
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.paidAmount).toBe(0)
    expect(payments.listByInvoice(inv.id)).toHaveLength(0)
    expect(invoices.getById(inv.id)!.status).toBe('cancelled')

    const rows = new StockService().list()
    const sale = rows.find((m) => m.type === 'sale' && m.referenceId === inv.id)
    const ret = rows.find((m) => m.type === 'return' && m.referenceId === inv.id)
    expect(sale).toBeTruthy()
    expect(sale!.quantity).toBe(-24) // 2 cartons × 12
    expect(ret).toBeTruthy()
    expect(ret!.quantity).toBe(24)
    expect(ret!.newQuantity).toBe(1200) // balance restored to the seeded level (100 cartons × 12)
  })

  it('a cancelled invoice cannot be paid and a paid invoice is kept until cancellation', () => {
    const base = seed()
    const invoices = new InvoiceService()
    const payments = new PaymentService()

    const inv = invoices.create(invoiceInput(base))
    expect(() => invoices.cancel(inv.id)!.status).not.toThrow()
    expect(() => payments.payInvoice(inv.id, 100)).toThrow(/cannot be paid/)

    const paid = invoices.create(invoiceInput(base, { tax: 1000 }))
    payments.payInvoice(paid.id, 2000)
    expect(() => invoices.delete(paid.id)).toThrow(/cannot be deleted/)
    expect(invoices.getById(paid.id)).toBeTruthy()
  })

  it('cancelling twice is rejected and deleting a cancelled invoice is allowed', () => {
    const base = seed()
    const invoices = new InvoiceService()
    const inv = invoices.create(invoiceInput(base))

    invoices.cancel(inv.id)
    expect(() => invoices.cancel(inv.id)).toThrow(/already cancelled/)

    invoices.delete(inv.id)
    expect(invoices.getById(inv.id)).toBeUndefined()
    expect(invoices.count()).toBe(0)
  })

  it('a cancelled invoice no longer contributes profit to the dashboard', () => {
    const base = seed()
    const invoices = new InvoiceService()
    // rate 1000 on the 500-paisa product: raw amount 2500 → Rs. 30 (3000),
    // cost 1250 -> profit 1750
    const created = invoices.create(
      invoiceInput(base, {
        items: [{ productId: base.product.id, rate: 1000, quantity: 30 }],
      })
    )

    const dashboard = new DashboardService()
    expect(dashboard.summary('2026-09-01', '2026-09-30').profit.total).toBe(1750)

    invoices.cancel(created.id)
    expect(dashboard.summary('2026-09-01', '2026-09-30').profit.total).toBe(0)
  })

  it('removing a payment restores the invoice paid amount and status', () => {
    const base = seed()
    const invoices = new InvoiceService()
    const payments = new PaymentService()

    const inv = invoices.create(invoiceInput(base, { tax: 1000 })) // due 2000
    const first = payments.payInvoice(inv.id, 800)
    expect(first.status).toBe('partial')

    const second = payments.payInvoice(inv.id, 1200)
    expect(second.status).toBe('paid')
    expect(second.paidAmount).toBe(2000)

    const recent = new PaymentService().listRecent()
    expect(recent).toHaveLength(2)
    expect(recent[0]).toMatchObject({ invoiceNumber: inv.invoiceNumber, customerName: 'Bilal Auto Shop' })

    // A mistaken entry removed: the invoice falls back to partial with 800 paid.
    const pay = new PaymentService().listByInvoice(inv.id).find((p) => p.amount === 1200)!
    const reversed = payments.removePayment(pay.id)
    expect(reversed.amount).toBe(1200)

    const updated = invoices.getById(inv.id)!
    expect(updated.status).toBe('partial')
    expect(updated.paidAmount).toBe(800)
    expect(payments.listByInvoice(inv.id)).toHaveLength(1)
  })

  it('removing the only payment returns the invoice to unpaid', () => {
    const base = seed()
    const invoices = new InvoiceService()
    const payments = new PaymentService()

    const inv = invoices.create(invoiceInput(base)) // due 1000
    payments.payInvoice(inv.id, 1000)
    payments.removePayment(new PaymentService().listByInvoice(inv.id)[0].id)

    const updated = invoices.getById(inv.id)!
    expect(updated.status).toBe('unpaid')
    expect(updated.paidAmount).toBe(0)
    expect(payments.listByInvoice(inv.id)).toHaveLength(0)
  })

  it('removing an unknown payment is rejected', () => {
    expect(() => new PaymentService().removePayment(99999)).toThrow(/Payment not found/)
  })
})