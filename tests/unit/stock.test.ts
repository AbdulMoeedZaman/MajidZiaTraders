import { describe, expect, it } from 'vitest'
import { InventoryService } from '../../src/main/services/inventory.service'
import { StockAdjustmentService } from '../../src/main/services/stock-adjustment.service'
import { ProductService } from '../../src/main/services/product.service'
import { RestockService } from '../../src/main/services/restock.service'
import { localDate } from '../../src/shared/date'
import { seedBasics, useTestDatabase } from './helpers'

useTestDatabase()

describe('stock chain', () => {
  it('stays correct when several changes happen in the same second', () => {
    const { product } = seedBasics()
    const adjustments = new StockAdjustmentService()
    adjustments.create({ productId: product.id, type: 'correction', quantityAdjustment: -10, reason: 'count' })
    adjustments.create({ productId: product.id, type: 'damage', quantityAdjustment: -5, reason: 'broken' })

    const inventory = new InventoryService()
    expect(inventory.getCurrentQuantity(product.id)).toBe(85)
    const chain = inventory.listMovements(product.id).reverse()
    expect(chain.map((m) => [m.previousQuantity, m.newQuantity])).toEqual([
      [0, 100],
      [100, 90],
      [90, 85],
    ])
  })
})

describe('stock adjustments', () => {
  it('are reversed (not deleted) so later stock stays right', () => {
    const { product } = seedBasics()
    const adjustments = new StockAdjustmentService()
    const first = adjustments.create({ productId: product.id, type: 'correction', quantityAdjustment: -10, reason: 'a' })
    adjustments.create({ productId: product.id, type: 'correction', quantityAdjustment: -1, reason: 'b' })

    adjustments.delete(first.id)

    expect(new InventoryService().getCurrentQuantity(product.id)).toBe(99)
    expect(adjustments.getById(first.id)?.reversedAt).toBeTruthy()
    expect(() => adjustments.delete(first.id)).toThrow(/already been reversed/)
  })

  it('refuse a reversal that would make stock negative', () => {
    const { product } = seedBasics()
    const adjustments = new StockAdjustmentService()
    const added = adjustments.create({ productId: product.id, type: 'return', quantityAdjustment: 5, reason: 'returned' })
    adjustments.create({ productId: product.id, type: 'loss', quantityAdjustment: -105, reason: 'lost' })
    expect(() => adjustments.delete(added.id)).toThrow(/negative/)
  })
})

describe('products', () => {
  it('cannot be deleted once they have stock history, but an unused product can', () => {
    const { product } = seedBasics()
    const products = new ProductService()
    expect(() => products.delete(product.id)).toThrow(/stock history/)

    const unused = products.create({ sku: 'UNUSED', name: 'Never stocked' })
    products.delete(unused.id)
    expect(products.getById(unused.id)).toBeFalsy()
  })
})

describe('restock numbers', () => {
  it('are never reused after the newest restock is deleted', () => {
    const { product } = seedBasics()
    const restocks = new RestockService()
    const order = () =>
      restocks.create({ supplierName: 'Acme', date: localDate(), items: [{ productId: product.id, quantity: 1, unitCost: 100 }] })
    order()
    const second = order()
    restocks.delete(second.id)
    const third = order()
    expect(third.referenceNumber).not.toBe(second.referenceNumber)
    expect(third.referenceNumber).toBe('RS-000003')
  })

  it('refuses to mark a restock received through update()', () => {
    const { product } = seedBasics()
    const restocks = new RestockService()
    const order = restocks.create({
      supplierName: 'Acme',
      date: localDate(),
      items: [{ productId: product.id, quantity: 1, unitCost: 100 }],
    })
    expect(() => restocks.update(order.id, { status: 'received' } as never)).toThrow(/Mark as received/)
    expect(restocks.getById(order.id)?.status).toBe('pending')
    expect(new InventoryService().getCurrentQuantity(product.id)).toBe(100)
  })
})
