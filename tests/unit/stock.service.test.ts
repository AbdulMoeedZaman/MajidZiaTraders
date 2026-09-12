import { describe, expect, it } from 'vitest'
import { StockService } from '../../src/main/services/stock.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { ProductService } from '../../src/main/services/product.service'
import { useTestDatabase, seedBasics } from './helpers'
import { localDate } from '../../src/shared/date'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('StockService', () => {
  useTestDatabase()

  const invoiceInput = (seed: ReturnType<typeof seedBasics>): CreateInvoiceDTO => ({
    customerId: seed.customerId,
    brokerId: seed.brokerId,
    date: '2026-09-10',
    filerStatus: 'filer',
    remaining: null,
    tax: null,
    grandTotal: null,
    items: [{ productId: seed.product.id, rate: 500, cartonCount: 2, boxCount: 5 }],
  })

  it('restock adds a purchase movement with a running balance', () => {
    const service = new StockService()
    const seed = seedBasics()

    const first = service.restock({ productId: seed.product.id, quantity: 50 })
    expect(first.type).toBe('purchase')
    expect(first.quantity).toBe(50)
    expect(first.previousQuantity).toBe(0)
    expect(first.newQuantity).toBe(50)
    expect(first.date).toBe(localDate(new Date()))

    const second = service.restock({ productId: seed.product.id, quantity: 10 })
    expect(second.previousQuantity).toBe(50)
    expect(second.newQuantity).toBe(60)

    const byProduct = service.listByProduct(seed.product.id)
    expect(byProduct).toHaveLength(2)
    expect(byProduct[0].productName).toBe('Widget 1')
  })

  it('rejects restock with an unknown product or an invalid quantity', () => {
    const service = new StockService()
    const seed = seedBasics()

    expect(() => service.restock({ productId: 9999, quantity: 5 })).toThrow(/Product not found/)
    expect(() => service.restock({ productId: seed.product.id, quantity: 0 })).toThrow(/whole number/)
    expect(() => service.restock({ productId: seed.product.id, quantity: -3 })).toThrow(/whole number/)
    expect(() => service.restock({ productId: seed.product.id, quantity: 2.5 })).toThrow(/whole number/)
    expect(service.list()).toHaveLength(0)
  })

  it('invoice create records sale movements with negative quantity, date and price snapshot', () => {
    const stock = new StockService()
    const invoice = new InvoiceService()
    const seed = seedBasics()

    invoice.create(invoiceInput(seed))

    const movements = stock.list()
    expect(movements).toHaveLength(1)
    const m = movements[0]
    expect(m.productId).toBe(seed.product.id)
    expect(m.productName).toBe('Widget 1')
    expect(m.type).toBe('sale')
    expect(m.quantity).toBe(-7) // 2 cartons + 5 boxes
    expect(m.previousQuantity).toBe(0)
    expect(m.newQuantity).toBe(-7)
    expect(m.date).toBe('2026-09-10')
    expect(m.price).toBe(500)
    expect(m.customerName).toBe('Bilal Auto Shop')
    expect(m.referenceType).toBe('invoice')
  })

  it('invoice delete removes its stock movements', () => {
    const invoice = new InvoiceService()
    const stock = new StockService()
    const seed = seedBasics()

    const created = invoice.create(invoiceInput(seed))
    expect(stock.list()).toHaveLength(1)

    invoice.delete(created.id)
    expect(stock.list()).toHaveLength(0)
  })

  it('deleting a product also removes its stock ledger entries', () => {
    const stock = new StockService()
    const products = new ProductService()
    const seed = seedBasics()

    stock.restock({ productId: seed.product.id, quantity: 30 })
    expect(stock.list()).toHaveLength(1)

    expect(() => products.delete(seed.product.id)).not.toThrow()
    expect(stock.list()).toHaveLength(0)
  })
})