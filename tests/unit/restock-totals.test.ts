import { describe, expect, it } from 'vitest'
import {
  computeRestockLineTotals,
  aggregateRestockLines,
  restockLineUnitCost,
  DEFAULT_SALES_TAX_RATE_BPS,
  DEFAULT_ADVANCE_TAX_RATE_BPS,
} from '../../src/shared/calc/restock-totals'

describe('restock line totals (sales-tax invoice maths)', () => {
  it('derives statutory retail price per carton inclusive of sales tax on retail value', () => {
    const t = computeRestockLineTotals({
      qtyCartons: 1,
      piecesPerCarton: 24,
      mrpPerPiece: 1500,
      salesTaxRate: DEFAULT_SALES_TAX_RATE_BPS,
      advanceTaxRate: DEFAULT_ADVANCE_TAX_RATE_BPS,
      netSalesValueExcl: 9000,
      tradeDiscountValue: 0,
    })
    // retailPricePerCarton = 24 * 1500 * 10000 / (10000 + 1800) = 30508.47... -> 30508
    expect(t.retailPricePerCarton).toBe(Math.round((24 * 1500 * 10000) / 11800))
    expect(t.totalRetailValueExcl).toBe(30508)
    // salesTaxAmount = 30508 * 1800 / 10000 = 5491.44 -> 5491
    expect(t.salesTaxAmount).toBe(Math.round((30508 * 1800) / 10000))
  })

  it('handles cartons so tax scales with quantity', () => {
    const per = computeRestockLineTotals({
      qtyCartons: 1,
      piecesPerCarton: 24,
      mrpPerPiece: 1500,
      salesTaxRate: DEFAULT_SALES_TAX_RATE_BPS,
      advanceTaxRate: DEFAULT_ADVANCE_TAX_RATE_BPS,
      netSalesValueExcl: 9000,
      tradeDiscountValue: 0,
    })
    const three = computeRestockLineTotals({
      qtyCartons: 3,
      piecesPerCarton: 24,
      mrpPerPiece: 1500,
      salesTaxRate: DEFAULT_SALES_TAX_RATE_BPS,
      advanceTaxRate: DEFAULT_ADVANCE_TAX_RATE_BPS,
      netSalesValueExcl: 27000,
      tradeDiscountValue: 0,
    })
    expect(three.totalRetailValueExcl).toBe(3 * per.totalRetailValueExcl)
    // Sales tax rounds on the line total, not on the per-carton values summed (plan §1.2).
    expect(three.salesTaxAmount).toBe(Math.round((3 * 30508 * 1800) / 10000))
  })

  it('charges advance tax on the net sales value (the trade price we pay)', () => {
    const t = computeRestockLineTotals({
      qtyCartons: 2,
      piecesPerCarton: 12,
      mrpPerPiece: 1000,
      salesTaxRate: DEFAULT_SALES_TAX_RATE_BPS,
      advanceTaxRate: DEFAULT_ADVANCE_TAX_RATE_BPS,
      netSalesValueExcl: 14400,
      tradeDiscountValue: 0,
    })
    // advanceTax = netSalesValueExcl * 10 / 10000 = 14.4 -> 14
    expect(t.advanceTax).toBe(Math.round((14400 * 10) / 10000))
    expect(t.advanceTax).toBe(14)
  })

  it('applies trade discount to the inclusive total payable', () => {
    const t = computeRestockLineTotals({
      qtyCartons: 1,
      piecesPerCarton: 24,
      mrpPerPiece: 1500,
      salesTaxRate: DEFAULT_SALES_TAX_RATE_BPS,
      advanceTaxRate: DEFAULT_ADVANCE_TAX_RATE_BPS,
      netSalesValueExcl: 9000,
      tradeDiscountValue: 2000,
    })
    expect(t.discountedValueInclusive).toBe(9000 + t.salesTaxAmount + t.advanceTax - 2000)
  })

  it('respects explicit per-line overrides so a line can match the physical invoice', () => {
    const t = computeRestockLineTotals(
      {
        qtyCartons: 2,
        piecesPerCarton: 24,
        mrpPerPiece: 1500,
        salesTaxRate: DEFAULT_SALES_TAX_RATE_BPS,
        advanceTaxRate: DEFAULT_ADVANCE_TAX_RATE_BPS,
        netSalesValueExcl: 60000,
        tradeDiscountValue: 0,
      },
      { retailPricePerCarton: 30500, salesTaxAmount: 10980 }
    )
    expect(t.retailPricePerCarton).toBe(30500)
    expect(t.salesTaxAmount).toBe(10980)
    expect(t.discountedValueInclusive).toBe(60000 + 10980 + t.advanceTax)
  })

  it('clamps garbage input to safe non-negative integers', () => {
    const t = computeRestockLineTotals({
      qtyCartons: -2,
      piecesPerCarton: NaN,
      mrpPerPiece: -5,
      salesTaxRate: -100,
      advanceTaxRate: -10,
      netSalesValueExcl: -1,
      tradeDiscountValue: 999999,
    })
    expect(t.totalRetailValueExcl).toBe(0)
    expect(t.salesTaxAmount).toBe(0)
    expect(t.advanceTax).toBe(0)
    expect(t.discountedValueInclusive).toBeLessThan(0) // discount larger than net is permitted by the math
    expect(Number.isInteger(t.retailPricePerCarton)).toBe(true)
  })

  it('handles unknown MRP (null) by deriving everything from net value only', () => {
    const t = computeRestockLineTotals({
      qtyCartons: 5,
      piecesPerCarton: 1,
      mrpPerPiece: null,
      salesTaxRate: DEFAULT_SALES_TAX_RATE_BPS,
      advanceTaxRate: DEFAULT_ADVANCE_TAX_RATE_BPS,
      netSalesValueExcl: 5000,
      tradeDiscountValue: 0,
    })
    expect(t.retailPricePerCarton).toBe(0)
    expect(t.totalRetailValueExcl).toBe(0)
    expect(t.salesTaxAmount).toBe(0)
    expect(t.advanceTax).toBe(Math.round((5000 * 10) / 10000))
    expect(t.discountedValueInclusive).toBe(5000 + t.advanceTax)
  })
})

describe('restock header totals', () => {
  it('aggregates all per-line figures into the grand total payable', () => {
    const lines = [
      {
        qtyCartons: 1,
        piecesPerCarton: 24,
        totalRetailValueExcl: 30508,
        salesTaxAmount: 5491,
        advanceTax: 14,
        tradeDiscountValue: 0,
        netSalesValueExcl: 9000,
        discountedValueInclusive: 14505,
      },
      {
        qtyCartons: 2,
        piecesPerCarton: 12,
        totalRetailValueExcl: 20339,
        salesTaxAmount: 3661,
        advanceTax: 14,
        tradeDiscountValue: 1000,
        netSalesValueExcl: 14400,
        discountedValueInclusive: 17075,
      },
    ]
    const totals = aggregateRestockLines(lines)
    expect(totals.totalRetailValueExcl).toBe(50847)
    expect(totals.totalSalesTax).toBe(9152)
    expect(totals.totalAdvanceTax).toBe(28)
    expect(totals.totalTradeDiscount).toBe(1000)
    expect(totals.totalNetValueExcl).toBe(23400)
    expect(totals.totalCost).toBe(lines.reduce((s, l) => s + l.discountedValueInclusive, 0))
    expect(totals.totalCost).toBe(totals.totalNetValueExcl + totals.totalSalesTax + totals.totalAdvanceTax - totals.totalTradeDiscount)
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
          totalRetailValueExcl: q * 30508,
          salesTaxAmount: q * 5491,
          advanceTax: 14,
          tradeDiscountValue: discount,
          netSalesValueExcl: netExcl,
          discountedValueInclusive: netExcl + q * 5491 + 14 - discount,
        }
        const totals = aggregateRestockLines([line])
        expect(totals.totalCost).toBe(line.discountedValueInclusive)
      }
    }
  })
})

describe('restockLineUnitCost', () => {
  it('divides the inclusive total across all received pieces', () => {
    expect(restockLineUnitCost({ qtyCartons: 3, piecesPerCarton: 24, discountedValueInclusive: 87300 })).toBe(1213)
  })

  it('returns 0 for an empty line and does not crash', () => {
    expect(restockLineUnitCost({ qtyCartons: 0, piecesPerCarton: 0, discountedValueInclusive: 500 })).toBe(0)
  })
})