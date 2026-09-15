import { describe, expect, it } from 'vitest'
import {
  calculateLineAmount,
  calculateInvoiceSubtotal,
  roundToTen,
} from '../../src/shared/calc/invoice-totals'

describe('roundToTen', () => {
  it('rounds to the nearest ten rupees: under Rs. 5 down to zero, Rs. 5 or more up', () => {
    expect(roundToTen(0)).toBe(0)
    expect(roundToTen(400)).toBe(0) // Rs. 4
    expect(roundToTen(499)).toBe(0)
    expect(roundToTen(500)).toBe(1000) // Rs. 5
    expect(roundToTen(900)).toBe(1000)
    expect(roundToTen(1000)).toBe(1000) // Rs. 10
    expect(roundToTen(1499)).toBe(1000) // Rs. 14.99
    expect(roundToTen(1500)).toBe(2000) // Rs. 15
    expect(roundToTen(1600)).toBe(2000)
    expect(roundToTen(14167)).toBe(14000) // Rs. 141.67
    expect(roundToTen(141500)).toBe(142000) // Rs. 1415
    expect(roundToTen(141000)).toBe(141000)
  })
})

describe('calculateLineAmount', () => {
  it('computes cartons at the full rate and boxes at the per-box rate', () => {
    // Rs. 100 per carton, 12 boxes per carton → per box ≈ Rs. 8.33
    const amount = calculateLineAmount({ rate: 10000, piecesPerCarton: 12, cartonCount: 3, boxCount: 6 })
    expect(amount).toBe(30000 + Math.round((10000 * 6) / 12)) // 30000 + 5000
  })

  it('rounds the box portion, then the whole line, to the nearest ten rupees', () => {
    // 17 boxes at Rs. 100/carton with 12/carton → 170000/12 ≈ 14167 → Rs. 140
    expect(calculateLineAmount({ rate: 10000, piecesPerCarton: 12, cartonCount: 0, boxCount: 17 })).toBe(14000)
    // 5 boxes * 10000 / 12 ≈ 4167 → Rs. 40
    expect(calculateLineAmount({ rate: 10000, piecesPerCarton: 12, cartonCount: 0, boxCount: 5 })).toBe(4000)
  })

  it('holds any non-zero line at the Rs. 10 minimum instead of rounding it down to zero', () => {
    // 1 loose box at Rs. 5/carton of 12 ≈ Rs. 0.42 → below Rs. 5, but a real
    // sale can never drop to Rs. 0, so the line is billed at Rs. 10.
    expect(calculateLineAmount({ rate: 500, piecesPerCarton: 12, cartonCount: 0, boxCount: 1 })).toBe(1000)
    // 1 carton at Rs. 5 is exactly Rs. 5 → rounds up to Rs. 10.
    expect(calculateLineAmount({ rate: 500, piecesPerCarton: 12, cartonCount: 1, boxCount: 0 })).toBe(1000)
  })

  it('guards against a zero or negative boxes-per-carton divisor', () => {
    expect(calculateLineAmount({ rate: 10000, piecesPerCarton: 0, cartonCount: 2, boxCount: 0 })).toBe(20000)
  })

  it('treats NaN counts as zero instead of producing NaN', () => {
    const amount = calculateLineAmount({ rate: 10000, piecesPerCarton: 12, cartonCount: Number.NaN, boxCount: 0 })
    expect(amount).toBe(0)
  })
})

describe('calculateInvoiceSubtotal', () => {
  it('sums the (already rounded) line amounts', () => {
    const subtotal = calculateInvoiceSubtotal([
      { rate: 10000, piecesPerCarton: 12, cartonCount: 1, boxCount: 0 },
      { rate: 5000, piecesPerCarton: 10, cartonCount: 0, boxCount: 5 },
    ])
    // 1 carton → Rs. 100; 5 loose boxes → Rs. 25 rounds up to Rs. 30.
    expect(subtotal).toBe(10000 + 3000)
  })

  it('returns zero for an empty or all-null invoice', () => {
    expect(calculateInvoiceSubtotal([])).toBe(0)
    expect(calculateInvoiceSubtotal([{ rate: 0, piecesPerCarton: 12, cartonCount: 0, boxCount: 0 }])).toBe(0)
  })
})