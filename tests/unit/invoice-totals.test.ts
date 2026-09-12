import { describe, expect, it } from 'vitest'
import {
  calculateLineAmount,
  calculateInvoiceSubtotal,
} from '../../src/shared/calc/invoice-totals'

describe('calculateLineAmount', () => {
  it('computes cartons at the full rate and boxes at the per-box rate', () => {
    // Rs. 100 per carton, 12 boxes per carton → per box ≈ Rs. 8.33
    const amount = calculateLineAmount({ rate: 10000, boxesPerCarton: 12, cartonCount: 3, boxCount: 6 })
    expect(amount).toBe(30000 + Math.round((10000 * 6) / 12)) // 30000 + 5000
  })

  it('rounds the box portion to the nearest paisa', () => {
    // 17 boxes at Rs. 100/carton with 12/carton → 170000/12 = 14166.67 → 14167
    expect(calculateLineAmount({ rate: 10000, boxesPerCarton: 12, cartonCount: 0, boxCount: 17 })).toBe(14167)
    // 5 boxes * 10000 / 12 = 4166.67 → 4167
    expect(calculateLineAmount({ rate: 10000, boxesPerCarton: 12, cartonCount: 0, boxCount: 5 })).toBe(4167)
  })

  it('guards against a zero or negative boxes-per-carton divisor', () => {
    expect(calculateLineAmount({ rate: 10000, boxesPerCarton: 0, cartonCount: 2, boxCount: 0 })).toBe(20000)
  })

  it('treats NaN counts as zero instead of producing NaN', () => {
    const amount = calculateLineAmount({ rate: 10000, boxesPerCarton: 12, cartonCount: Number.NaN, boxCount: 0 })
    expect(amount).toBe(0)
  })
})

describe('calculateInvoiceSubtotal', () => {
  it('sums the line amounts', () => {
    const subtotal = calculateInvoiceSubtotal([
      { rate: 10000, boxesPerCarton: 12, cartonCount: 1, boxCount: 0 },
      { rate: 5000, boxesPerCarton: 10, cartonCount: 0, boxCount: 5 },
    ])
    expect(subtotal).toBe(10000 + 2500)
  })

  it('returns zero for an empty or all-null invoice', () => {
    expect(calculateInvoiceSubtotal([])).toBe(0)
    expect(calculateInvoiceSubtotal([{ rate: 0, boxesPerCarton: 12, cartonCount: 0, boxCount: 0 }])).toBe(0)
  })
})