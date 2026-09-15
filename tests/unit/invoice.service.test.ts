import { describe, expect, it } from 'vitest'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { ProductService } from '../../src/main/services/product.service'
import { CustomerService } from '../../src/main/services/customer.service'
import { BrokerService } from '../../src/main/services/broker.service'
import { StockService } from '../../src/main/services/stock.service'
import { useTestDatabase, seedBasics, seedStocked, routeIdFor } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('InvoiceService', () => {
  useTestDatabase()

  const invoiceInput = (seed: ReturnType<typeof seedBasics>): CreateInvoiceDTO => ({
    customerId: seed.customerId,
    brokerId: seed.brokerId,
    date: '2026-09-10',
    filerStatus: 'filer',
    tax: null,
    items: [{ productId: seed.product.id, rate: 500, quantity: 24 }],
  })

  it('creates invoices with sequential INV-xxxxxx numbers starting at 000001', () => {
    const service = new InvoiceService()
    const seed = seedStocked(4)

    const first = service.create(invoiceInput(seed))
    expect(first.invoiceNumber).toBe('INV-000001')
    expect(first.subtotal).toBe(2 * 500)

    const second = service.create(invoiceInput(seed))
    expect(second.invoiceNumber).toBe('INV-000002')
  })

  it('computes the box-portion of each line, rounding it and the tax to the nearest ten, and auto-calculates grand total and remaining', () => {
    const service = new InvoiceService()
    const seed = seedStocked(5)
    const created = service.create({
      customerId: seed.customerId,
      brokerId: seed.brokerId,
      date: '2026-09-10',
      filerStatus: 'non_filer',
      tax: 200,
      items: [{ productId: seed.product.id, rate: 500, quantity: 5 }],
    })
    // 500 * 5 / 12 = 208.33 → 208, rounded to the nearest ten → 210
    expect(created.subtotal).toBe(210)
    const details = service.getWithDetails(created.id)!
    expect(details.invoice.items[0].amount).toBe(210)
    expect(details.invoice.tax).toBe(200)
    // grand total = subtotal + tax; remaining = grand total (no payments yet)
    expect(details.invoice.grandTotal).toBe(410)
    expect(details.invoice.remaining).toBe(410)
    expect(details.customer!.code).toBe('C-001')
  })

  it('rejects rates below the product minimum rate', () => {
    const service = new InvoiceService()
    const seed = seedBasics()
    const input = invoiceInput(seed)
    input.items = [{ productId: seed.product.id, rate: 499, quantity: 12 }]
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
    const seed = seedStocked(2)
    service.create(invoiceInput(seed))

    expect(() => new ProductService().delete(seed.product.id)).toThrow(/invoice/i)
    expect(new ProductService().getById(seed.product.id)).not.toBeFalsy()
  })

  it('deletes an invoice cleanly so the product can be deleted afterwards', () => {
    const service = new InvoiceService()
    const seed = seedStocked(2)
    const created = service.create(invoiceInput(seed))

    service.delete(created.id)
    expect(service.count()).toBe(0)

    new CustomerService().delete(seed.customerId)
    new ProductService().delete(seed.product.id)
    expect(new ProductService().getById(seed.product.id)).toBeFalsy()
  })

  it('refuses to create an invoice before a project owner is set up', () => {
    const routeId = routeIdFor('Monday')
    const product = new ProductService().create({ name: 'Widget', rate: 500, piecesPerCarton: 12 })
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
        tax: null,
        items: [{ productId: product.id, rate: 500, quantity: 12 }],
      })
    ).toThrow(/Set up the project owner/)
    expect(service.count()).toBe(0)
  })

  it('builds a load form report aggregating products and customer totals', () => {
    const service = new InvoiceService()
    const seed = seedStocked(7)
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
      tax: 1292,
      items: [{ productId: seed.product.id, rate: 500, quantity: 5 }],
    })

    // Raw tax 1292 rounds down to 1290 (stored); subtotal 210 rounds up from 208,
    // so the grand total ends up the same clean 1500 either way.
    expect(second.subtotal).toBe(210)
    expect(second.tax).toBe(1290)
    expect(second.grandTotal).toBe(1500)

    const report = service.buildLoadReport([first.id, second.id])

    expect(report.invoiceNumbers).toEqual(['INV-000001', 'INV-000002'])
    expect(report.products).toHaveLength(1)
    expect(report.products[0].productName).toBe('Widget 1')
    expect(report.products[0].cartonCount).toBe(2)
    expect(report.products[0].boxCount).toBe(5)
    expect(report.products[0].totalQuantity).toBe(29)

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

  it('autofills a line rate with the product sales price when no rate is given', () => {
    const product = new ProductService().create({
      name: 'Priced Widget',
      rate: 500,
      salesPrice: 620,
      piecesPerCarton: 12,
    })
    new StockService().restock({ productId: product.id, quantity: 12 })
    const seed = seedBasics()

    const created = new InvoiceService().create({
      customerId: seed.customerId,
      brokerId: seed.brokerId,
      date: '2026-09-10',
      filerStatus: 'filer',
      tax: null,
      items: [{ productId: product.id, quantity: 12 }],
    })

    const details = new InvoiceService().getWithDetails(created.id)!
    expect(details.invoice.items[0].rate).toBe(620)
    // 620 cannot go below the 500 minimum, and no explicit rate means it wins.
    expect(details.invoice.items[0].minRate).toBe(500)
  })

  it('falls back to the product minimum rate when no sales price is set', () => {
    const seed = seedStocked(12)
    const created = new InvoiceService().create({
      customerId: seed.customerId,
      brokerId: seed.brokerId,
      date: '2026-09-10',
      filerStatus: 'filer',
      tax: null,
      items: [{ productId: seed.product.id, quantity: 12 }],
    })

    const details = new InvoiceService().getWithDetails(created.id)!
    // seedBasics has no salesPrice, so the default rate is the minimum 500.
    expect(details.invoice.items[0].rate).toBe(500)
    expect(details.invoice.items[0].rate).toBe(seed.product.rate)
  })

  it('uses an explicit rate even when the product has a sales price', () => {
    const product = new ProductService().create({
      name: 'Override Widget',
      rate: 500,
      salesPrice: 620,
      piecesPerCarton: 12,
    })
    new StockService().restock({ productId: product.id, quantity: 12 })
    const seed = seedBasics()

    const created = new InvoiceService().create({
      customerId: seed.customerId,
      brokerId: seed.brokerId,
      date: '2026-09-10',
      filerStatus: 'filer',
      tax: null,
      items: [{ productId: product.id, rate: 580, quantity: 12 }],
    })

    const details = new InvoiceService().getWithDetails(created.id)!
    expect(details.invoice.items[0].rate).toBe(580)
  })
})