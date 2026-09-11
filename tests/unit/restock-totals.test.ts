import { describe, expect, it } from 'vitest'
import {
  computeRestockLineTotals,
  aggregateRestockLines,
  restockLineUnitCost,
} from '../../src/shared/calc/restock-totals'

describe('restock line totals', () => {
  it('charges the net trade value minus the trade discount', () => {
    const t = computeRestockLineTotals({
      qtyCartons: 1,
      piecesPerCarton: 24,
      netSalesValueExcl: 9000,
      tradeDiscountValue: 0,
    })
    expect(t.discountedValueInclusive).toBe(9000)
  })

  it('applies the trade discount to the payable total', () => {
    const t = computeRestockLineTotals({
      qtyCartons: 2,
      piecesPerCarton: 12,
      netSalesValueExcl: 14400,
      tradeDiscountValue: 2000,
    })
    expect(t.discountedValueInclusive).toBe(12400)
  })

  it('never produces a negative payable total', () => {
    const t = computeRestockLineTotals({
      qtyCartons: 1,
      piecesPerCarton: 1,
      netSalesValueExcl: 500,
      tradeDiscountValue: 999999,
    })
    expect(t.discountedValueInclusive).toBe(0)
  })

  it('clamps garbage input to safe non-negative integers', () => {
    const t = computeRestockLineTotals({
      qtyCartons: -2,
      piecesPerCarton: NaN,
      netSalesValueExcl: -1,
      tradeDiscountValue: NaN,
    })
    expect(t.discountedValueInclusive).toBe(0)
  })

  it('treats a null/zero net value as a free line', () => {
    const t = computeRestockLineTotals({
      qtyCartons: 5,
      piecesPerCarton: 24,
      netSalesValueExcl: 0,
      tradeDiscountValue: 0,
    })
    expect(t.discountedValueInclusive).toBe(0)
  })
})

describe('restock header totals', () => {
  it('aggregates all per-line figures into the grand total payable', () => {
    const lines = [
      {
        qtyCartons: 1,
        piecesPerCarton: 24,
        tradeDiscountValue: 0,
        netSalesValueExcl: 9000,
        discountedValueInclusive: 9000,
      },
      {
        qtyCartons: 2,
        piecesPerCarton: 12,
        tradeDiscountValue: 1000,
        netSalesValueExcl: 14400,
        discountedValueInclusive: 13400,
      },
    ]
    const totals = aggregateRestockLines(lines)
    expect(totals.totalTradeDiscount).toBe(1000)
    expect(totals.totalNetValueExcl).toBe(23400)
    expect(totals.totalCost).toBe(lines.reduce((s, l) => s + l.discountedValueInclusive, 0))
    expect(totals.totalCost).toBe(totals.totalNetValueExcl - totals.totalTradeDiscount)
  })

  it('stays consistent under arbitrary inputs', () => {
    for (const q of [1, 2, 3]) {
      for (const [netExcl, discount] of [
        [9000, 0],
        [12000, 2000],
        [0, 0],
      ] as const) {
        const line = {
          qtyCartons: q,
          piecesPerCarton: 24,
          tradeDiscountValue: discount,
          netSalesValueExcl: netExcl,
          discountedValueInclusive: Math.max(0, netExcl - discount),
        }
        const totals = aggregateRestockLines([line])
        expect(totals.totalCost).toBe(line.discountedValueInclusive)
      }
    }
  })
})

describe('restockLineUnitCost', () => {
  it('divides the payable total across all received pieces', () => {
    expect(restockLineUnitCost({ qtyCartons: 3, piecesPerCarton: 24, discountedValueInclusive: 87300 })).toBe(1213)
  })

  it('returns 0 for an empty line and does not crash', () => {
    expect(restockLineUnitCost({ qtyCartons: 0, piecesPerCarton: 0, discountedValueInclusive: 500 })).toBe(0)
  })
})