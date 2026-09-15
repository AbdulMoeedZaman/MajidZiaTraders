import { describe, expect, it } from 'vitest'
import { ProductPreferenceService } from '../../src/main/services/product-preference.service'
import { ProductService } from '../../src/main/services/product.service'
import { useTestDatabase, seedBasics } from './helpers'

describe('ProductPreferenceService', () => {
  useTestDatabase()

  const service = () => new ProductPreferenceService()

  it('lists preferences with the denormalized product name', () => {
    const seed = seedBasics()
    service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: 540 })

    const prefs = service().listForCustomer(seed.customerId)
    expect(prefs).toHaveLength(1)
    expect(prefs[0].productName).toBe('Widget 1')
    expect(prefs[0].preferencePrice).toBe(540)
  })

  it('keeps the product preferred but clears an agreed price when null is passed', () => {
    const seed = seedBasics()
    service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: 540 })
    const updated = service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: null })

    expect(updated.preferencePrice).toBeNull()
    const prefs = service().listForCustomer(seed.customerId)
    expect(prefs).toHaveLength(1)
    expect(prefs[0].preferencePrice).toBeNull()
  })

  it('does not upsert duplicates for the same (customer, product)', () => {
    const seed = seedBasics()
    service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: 500 })
    service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: 520 })

    expect(service().listForCustomer(seed.customerId)).toHaveLength(1)
    expect(service().priceMapForCustomer(seed.customerId).get(seed.product.id)).toBe(520)
  })

  it('rejects a preference price below the product minimum rate', () => {
    const seed = seedBasics()
    expect(() =>
      service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: 499 })
    ).toThrow(/minimum rate/)
  })

  it('rejects a negative or fractional preference price', () => {
    const seed = seedBasics()
    expect(() =>
      service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: -1 })
    ).toThrow(/cannot be negative/)
    expect(() =>
      service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: 500.5 })
    ).toThrow(/whole number/)
  })

  it('rejects an unknown customer or product', () => {
    const seed = seedBasics()
    expect(() => service().listForCustomer(9999)).toThrow(/Customer not found/)
    expect(() =>
      service().set({ customerId: seed.customerId, productId: 9999, preferencePrice: 500 })
    ).toThrow(/Product not found/)
  })

  it('removes a preference', () => {
    const seed = seedBasics()
    service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: 540 })
    service().remove(seed.customerId, seed.product.id)
    expect(service().listForCustomer(seed.customerId)).toHaveLength(0)
    expect(service().priceMapForCustomer(seed.customerId).size).toBe(0)
  })

  it('recordPurchases establishes an entry on first purchase and never overwrites a later price', () => {
    const seed = seedBasics()
    const product2 = new ProductService().create({ name: 'Widget 2', rate: 510, piecesPerCarton: 12 })

    service().recordPurchases(seed.customerId, [
      { productId: seed.product.id, rate: 500 },
      { productId: product2.id, rate: 510 },
    ])
    expect(service().listForCustomer(seed.customerId)).toHaveLength(2)

    service().set({ customerId: seed.customerId, productId: seed.product.id, preferencePrice: 560 })
    service().recordPurchases(seed.customerId, [{ productId: seed.product.id, rate: 500 }])

    const prefs = service().listForCustomer(seed.customerId)
    const pref = prefs.find((p) => p.productId === seed.product.id)!
    expect(pref.preferencePrice).toBe(560)
  })
})