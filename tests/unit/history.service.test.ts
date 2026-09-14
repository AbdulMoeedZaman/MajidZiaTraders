import { describe, expect, it } from 'vitest'
import { HistoryService } from '../../src/main/services/history.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { PaymentService } from '../../src/main/services/payment.service'
import { useTestDatabase, seedStocked } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('HistoryService audit log', () => {
  useTestDatabase()

  const invoiceInput = (seed: ReturnType<typeof seedStocked>): CreateInvoiceDTO => ({
    customerId: seed.customerId,
    brokerId: seed.brokerId,
    date: '2026-09-10',
    filerStatus: 'filer',
    tax: null,
    items: [{ productId: seed.product.id, rate: 500, quantity: 24 }],
  })

  it('records product, restock, invoice and payment actions, newest first', () => {
    const seed = seedStocked(10)
    const inv = new InvoiceService().create(invoiceInput(seed))
    new PaymentService().payInvoice(inv.id, 500)

    const logs = new HistoryService().list()
    expect(logs).toHaveLength(4)
    expect(logs.map((l) => l.action)).toEqual([
      'payment_recorded',
      'invoice_created',
      'restocked',
      'product_created',
    ])
    expect(logs.every((l) => l.status === 'applied')).toBe(true)
    expect(logs[2].summary).toContain('Widget 1')
    expect(logs[1].summary).toContain('INV-000001')
  })

  it('limits recent() to the newest actions', () => {
    const seed = seedStocked(10)
    new InvoiceService().create(invoiceInput(seed))
    new InvoiceService().create({ ...invoiceInput(seed), date: '2026-09-11' })

    const logs = new HistoryService().recent(3)
    expect(logs).toHaveLength(3)
    expect(logs[0].action).toBe('invoice_created')
    expect(logs[0].summary).toContain('INV-000002')
  })

  it('is read-only: it appends entries but exposes only list/recent', () => {
    const history = new HistoryService()
    expect('undo' in history).toBe(false)
    expect('redo' in history).toBe(false)
  })
})