import { describe, expect, it } from 'vitest'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { ProductService } from '../../src/main/services/product.service'
import { CustomerService } from '../../src/main/services/customer.service'
import { useTestDatabase, seedBasics } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('InvoiceService', () => {
  useTestDatabase()

  const invoiceInput = (seed: ReturnType<typeof seedBasics>): CreateInvoiceDTO => ({
    customerId: seed.customerId,
    ownerId: seed.ownerId,
    brokerId: seed.brokerId,
    date: '2026-09-10',
    filerStatus: 'filer',
    remaining: null,
    tax: null,
    grandTotal: null,
    items: [{ productId: seed.product.id, rate: 500, cartonCount: 2, boxCount: 0 }],
  })

  it('creates invoices with sequential INV-xxxxxx numbers starting at 000001', () => {
    const service = new InvoiceService()
    const seed = seedBasics()

    const first = service.create(invoiceInput(seed))
    expect(first.invoiceNumber).toBe('INV-000001')
    expect(first.subtotal).toBe(2 * 500)

    const second = service.create(invoiceInput(seed))
    expect(second.invoiceNumber).toBe('INV-000002')
  })

  it('computes the box-portion of each line with single rounding', () => {
    const service = new InvoiceService()
    const seed = seedBasics()
    const created = service.create({
      customerId: seed.customerId,
      ownerId: seed.ownerId,
      brokerId: seed.brokerId,
      date: '2026-09-10',
      filerStatus: 'non_filer',
      remaining: 1000,
      tax: 200,
      grandTotal: 3000,
      items: [{ productId: seed.product.id, rate: 500, cartonCount: 0, boxCount: 5 }],
    })
    // 500 * 5 / 12 = 208.33 → 208
    expect(created.subtotal).toBe(208)
    const details = service.getWithDetails(created.id)!
    expect(details.invoice.items[0].amount).toBe(208)
    expect(details.invoice.remaining).toBe(1000)
    expect(details.invoice.tax).toBe(200)
    expect(details.invoice.grandTotal).toBe(3000)
    expect(details.customer!.code).toBe('C-001')
  })

  it('rejects rates below the product minimum rate', () => {
    const service = new InvoiceService()
    const seed = seedBasics()
    const input = invoiceInput(seed)
    input.items = [{ productId: seed.product.id, rate: 499, cartonCount: 1, boxCount: 0 }]
    expect(() => service.create(input)).toThrow(/minimum rate/)
    expect(service.count()).toBe(0)
  })

  it('rejects an invoice with no items', () => {
    const service = new InvoiceService()
    const seed = seedBasics()
    const input = invoiceInput(seed)
    input.items = []
    expect(() => service.create(input)).toThrow(/at least one/)
  })

  it('rejects an invalid date or unknown customer', () => {
    const service = new InvoiceService()
    const seed = seedBasics()

    const badDate = invoiceInput(seed)
    badDate.date = '12-34-5678'
    expect(() => service.create(badDate)).toThrow()

    const badCustomer = invoiceInput(seed)
    badCustomer.customerId = 9999
    expect(() => service.create(badCustomer)).toThrow(/Customer not found/)
  })

  it('rejects deleting a product that is used on an invoice', () => {
    const service = new InvoiceService()
    const seed = seedBasics()
    service.create(invoiceInput(seed))

    expect(() => new ProductService().delete(seed.product.id)).toThrow(/invoice/i)
    expect(new ProductService().getById(seed.product.id)).not.toBeFalsy()
  })

  it('deletes an invoice cleanly so the product can be deleted afterwards', () => {
    const service = new InvoiceService()
    const seed = seedBasics()
    const created = service.create(invoiceInput(seed))

    service.delete(created.id)
    expect(service.count()).toBe(0)

    new CustomerService().delete(seed.customerId)
    new ProductService().delete(seed.product.id)
    expect(new ProductService().getById(seed.product.id)).toBeFalsy()
  })
})