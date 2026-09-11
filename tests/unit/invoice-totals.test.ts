import { describe, expect, it } from 'vitest'
import { allocateDiscount, calculateInvoiceTotals, computeInvoiceStatus } from '../../src/shared/calc/invoice-totals'

describe('calculateInvoiceTotals', () => {
  it('subtracts the discount from the subtotal and keeps tax out of the maths', () => {
    const t = calculateInvoiceTotals([{ quantity: 10, unitPrice: 1500, unitCost: 1000 }], 1000)
    expect(t).toMatchObject({
      subtotal: 15000,
      discount: 1000,
      total: 14000,
      totalCost: 10000,
      profit: 4000,
    })
  })

  it('spreads the discount over the lines so line figures add up to the invoice', () => {
    const t = calculateInvoiceTotals(
      [
        { quantity: 3, unitPrice: 333, unitCost: 100 },
        { quantity: 1, unitPrice: 1001, unitCost: 500 },
        { quantity: 7, unitPrice: 13, unitCost: 5 },
      ],
      457
    )
    expect(t.lines.reduce((s, l) => s + l.lineDiscount, 0)).toBe(457)
    expect(t.lines.reduce((s, l) => s + l.lineProfit, 0)).toBe(t.profit)
  })

  it('never applies more discount than the subtotal', () => {
    const t = calculateInvoiceTotals([{ quantity: 1, unitPrice: 1000, unitCost: 0 }], 999999)
    expect(t.discount).toBe(1000)
    expect(t.total).toBe(0)
  })

  it('treats unusable form input as zero instead of NaN', () => {
    const t = calculateInvoiceTotals([{ quantity: Number.NaN, unitPrice: 500, unitCost: 100 }], 0)
    expect(t.total).toBe(0)
  })
})

describe('allocateDiscount', () => {
  it('always hands out exactly the discount (capped at the total)', () => {
    for (const discount of [1, 2, 3, 7, 50, 99, 100, 101]) {
      const parts = allocateDiscount([1, 1, 1, 97], discount)
      expect(parts.reduce((s, v) => s + v, 0)).toBe(Math.min(discount, 100))
      parts.forEach((p, i) => expect(p).toBeLessThanOrEqual([1, 1, 1, 97][i]))
    }
  })
})

describe('computeInvoiceStatus', () => {
  const today = '2026-09-10'
  it.each([
    [{ status: 'sent', dueDate: null, paid: 0, outstanding: 100 }, 'sent'],
    [{ status: 'sent', dueDate: null, paid: 50, outstanding: 50 }, 'partial'],
    [{ status: 'partial', dueDate: null, paid: 100, outstanding: 0 }, 'paid'],
    [{ status: 'sent', dueDate: '2026-09-09', paid: 0, outstanding: 100 }, 'overdue'],
    [{ status: 'overdue', dueDate: '2026-09-11', paid: 0, outstanding: 100 }, 'sent'],
    [{ status: 'cancelled', dueDate: '2020-01-01', paid: 0, outstanding: 100 }, 'cancelled'],
  ] as const)('%o → %s', (invoice, expected) => {
    expect(computeInvoiceStatus(invoice, today)).toBe(expected)
  })
})
