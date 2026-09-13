import { describe, expect, it } from 'vitest'
import { StockService } from '../../src/main/services/stock.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { ProductService } from '../../src/main/services/product.service'
import { useTestDatabase, seedBasics, seedStocked } from './helpers'
import { localDate } from '../../src/shared/date'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('StockService', () => {
  useTestDatabase()

  const invoiceInput = (seed: ReturnType<typeof seedBasics>): CreateInvoiceDTO => ({
    customerId: seed.customerId,
    brokerId: seed.brokerId,
    date: '2026-09-10',
    filerStatus: 'filer',
    tax: null,
    items: [{ productId: seed.product.id, rate: 500, cartonCount: 2, boxCount: 5 }],
  })

  it('restock adds a purchase movement with a running balance, in pieces (cartons × boxes per carton)', () => {
    const service = new StockService()
    const seed = seedBasics()

    const first = service.restock({ productId: seed.product.id, quantity: 50 })
    expect(first.type).toBe('purchase')
    expect(first.quantity).toBe(600) // 50 cartons × 12 pcs
    expect(first.previousQuantity).toBe(0)
    expect(first.newQuantity).toBe(600)
    expect(first.date).toBe(localDate(new Date()))

    const second = service.restock({ productId: seed.product.id, quantity: 10 })
    expect(second.previousQuantity).toBe(600)
    expect(second.newQuantity).toBe(720)

    const byProduct = service.listByProduct(seed.product.id)
    expect(byProduct).toHaveLength(2)
    expect(byProduct[0].productName).toBe('Widget 1')
  })

  it('restock supports loose pieces on their own or mixed with cartons', () => {
    const service = new StockService()
    const seed = seedBasics()

    const looseOnly = service.restock({ productId: seed.product.id, quantity: 0, loosePieces: 7 })
    expect(looseOnly.quantity).toBe(7)
    expect(looseOnly.newQuantity).toBe(7)

    const mixed = service.restock({ productId: seed.product.id, quantity: 2, loosePieces: 5 })
    expect(mixed.quantity).toBe(29) // 2 cartons × 12 + 5 pieces
    expect(mixed.previousQuantity).toBe(7)
    expect(mixed.newQuantity).toBe(36)

    const cartonsOnly = service.restock({ productId: seed.product.id, quantity: 50 })
    expect(cartonsOnly.quantity).toBe(600)
    expect(cartonsOnly.newQuantity).toBe(636)
  })

  it('rejects restock with an unknown product or an invalid quantity', () => {
    const service = new StockService()
    const seed = seedBasics()

    expect(() => service.restock({ productId: 9999, quantity: 5 })).toThrow(/Product not found/)
    expect(() => service.restock({ productId: seed.product.id, quantity: 0 })).toThrow(/Enter cartons or loose pieces/)
    expect(() => service.restock({ productId: seed.product.id, quantity: 0, loosePieces: 0 })).toThrow(/Enter cartons or loose pieces/)
    expect(() => service.restock({ productId: seed.product.id, quantity: -3 })).toThrow(/whole number/)
    expect(() => service.restock({ productId: seed.product.id, quantity: 2.5 })).toThrow(/whole number/)
    expect(() => service.restock({ productId: seed.product.id, quantity: 5, loosePieces: -1 })).toThrow(/whole number/)
    expect(() => service.restock({ productId: seed.product.id, quantity: 5, loosePieces: 1.5 })).toThrow(/whole number/)
    expect(service.list()).toHaveLength(0)
  })

  it('invoice create records sale movements with negative pieces, date and price snapshot', () => {
    const stock = new StockService()
    const invoice = new InvoiceService()
    const seed = seedStocked(7)

    invoice.create(invoiceInput(seed))

    const movements = stock.list()
    expect(movements).toHaveLength(2)
    const m = movements.find((x) => x.type === 'sale')!
    expect(m.productId).toBe(seed.product.id)
    expect(m.productName).toBe('Widget 1')
    expect(m.type).toBe('sale')
    expect(m.quantity).toBe(-29) // 2 cartons × 12 + 5 boxes, in pieces
    expect(m.previousQuantity).toBe(84) // 7 cartons × 12
    expect(m.newQuantity).toBe(55)
    expect(m.date).toBe('2026-09-10')
    expect(m.price).toBe(500)
    expect(m.customerName).toBe('Bilal Auto Shop')
    expect(m.referenceType).toBe('invoice')
  })

  it('invoice delete removes its stock movements', () => {
    const invoice = new InvoiceService()
    const stock = new StockService()
    const seed = seedStocked(100)

    const created = invoice.create(invoiceInput(seed))
    expect(stock.list()).toHaveLength(2)

    invoice.delete(created.id)
    expect(stock.list()).toHaveLength(1) // the purchase movement remains
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