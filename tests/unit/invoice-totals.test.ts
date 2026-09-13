import { describe, expect, it } from 'vitest'
import {
  calculateLineAmount,
  calculateInvoiceSubtotal,
  roundToTen,
} from '../../src/shared/calc/invoice-totals'

describe('roundToTen', () => {
  it('keeps anything at five or below rounded down to zero and above five up to ten', () => {
    expect(roundToTen(0)).toBe(0)
    expect(roundToTen(4)).toBe(0)
    expect(roundToTen(5)).toBe(0)
    expect(roundToTen(6)).toBe(10)
    expect(roundToTen(9)).toBe(10)
    expect(roundToTen(10)).toBe(10)
    expect(roundToTen(15)).toBe(10)
    expect(roundToTen(16)).toBe(20)
    expect(roundToTen(14167)).toBe(14170)
    expect(roundToTen(14165)).toBe(14160)
    expect(roundToTen(14160)).toBe(14160)
  })
})

describe('calculateLineAmount', () => {
  it('computes cartons at the full rate and boxes at the per-box rate', () => {
    // Rs. 100 per carton, 12 boxes per carton → per box ≈ Rs. 8.33
    const amount = calculateLineAmount({ rate: 10000, boxesPerCarton: 12, cartonCount: 3, boxCount: 6 })
    expect(amount).toBe(30000 + Math.round((10000 * 6) / 12)) // 30000 + 5000
  })

  it('rounds the box portion, then the whole line, to the nearest ten paisa', () => {
    // 17 boxes at Rs. 100/carton with 12/carton → 170000/12 ≈ 14167 → 14170
    expect(calculateLineAmount({ rate: 10000, boxesPerCarton: 12, cartonCount: 0, boxCount: 17 })).toBe(14170)
    // 5 boxes * 10000 / 12 ≈ 4167 → 4170
    expect(calculateLineAmount({ rate: 10000, boxesPerCarton: 12, cartonCount: 0, boxCount: 5 })).toBe(4170)
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
  it('sums the (already rounded) line amounts', () => {
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