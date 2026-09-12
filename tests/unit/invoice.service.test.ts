import { describe, expect, it } from 'vitest'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { ProductService } from '../../src/main/services/product.service'
import { CustomerService } from '../../src/main/services/customer.service'
import { BrokerService } from '../../src/main/services/broker.service'
import { useTestDatabase, seedBasics, routeIdFor } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('InvoiceService', () => {
  useTestDatabase()

  const invoiceInput = (seed: ReturnType<typeof seedBasics>): CreateInvoiceDTO => ({
    customerId: seed.customerId,
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

  it('refuses to create an invoice before a project owner is set up', () => {
    const routeId = routeIdFor('Monday')
    const product = new ProductService().create({ name: 'Widget', rate: 500, boxesPerCarton: 12 })
    const broker = new BrokerService().create({ name: 'Bashir', phone: '0301-7654321' })
    const customer = new CustomerService().create({
      code: 'C-001',
      shopName: 'Bilal Auto Shop',
      ownerName: 'Bilal',
      routeId,
    })

    const service = new InvoiceService()
    expect(() =>
      service.create({
        customerId: customer.id,
        brokerId: broker.id,
        date: '2026-09-10',
        filerStatus: 'filer',
        remaining: null,
        tax: null,
        grandTotal: null,
        items: [{ productId: product.id, rate: 500, cartonCount: 1, boxCount: 0 }],
      })
    ).toThrow(/Set up the project owner/)
    expect(service.count()).toBe(0)
  })

  it('builds a load form report aggregating products and customer totals', () => {
    const service = new InvoiceService()
    const seed = seedBasics()
    const secondCustomer = new CustomerService().create({
      code: 'C-002',
      shopName: 'Emerald Parts',
      ownerName: 'Imran',
      routeId: routeIdFor('Tuesday'),
    })

    const first = service.create(invoiceInput(seed))
    const second = service.create({
      customerId: secondCustomer.id,
      brokerId: seed.brokerId,
      date: '2026-09-11',
      filerStatus: 'non_filer',
      remaining: null,
      tax: null,
      grandTotal: 1500,
      items: [{ productId: seed.product.id, rate: 500, cartonCount: 0, boxCount: 5 }],
    })

    const report = service.buildLoadReport([first.id, second.id])

    expect(report.invoiceNumbers).toEqual(['INV-000001', 'INV-000002'])
    expect(report.products).toHaveLength(1)
    expect(report.products[0].productName).toBe('Widget 1')
    expect(report.products[0].cartonCount).toBe(2)
    expect(report.products[0].boxCount).toBe(5)
    expect(report.products[0].totalQuantity).toBe(7)

    expect(report.customers).toHaveLength(2)
    const c1 = report.customers.find((c) => c.customerName === 'Bilal Auto Shop')
    const c2 = report.customers.find((c) => c.customerName === 'Emerald Parts')
    expect(c1?.amount).toBe(1000)
    expect(c2?.amount).toBe(1500)
    expect(report.grandTotal).toBe(2500)
  })

  it('rejects an empty invoice selection for a load form', () => {
    const service = new InvoiceService()
    expect(() => service.buildLoadReport([])).toThrow(/at least one/)
  })
})