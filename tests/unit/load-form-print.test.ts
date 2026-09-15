import { describe, expect, it } from 'vitest'
import {
  groupIntoTwoUp,
  planInvoicePages,
  bulkPrintOrder,
  planBulkPrint,
} from '../../src/renderer/src/lib/load-form-print'

describe('load form bulk print pagination', () => {
  it('groups an even count into full two-up pages preserving order', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(groupIntoTwoUp(items)).toEqual([
      { first: 'a', second: 'b' },
      { first: 'c', second: 'd' },
    ])
  })

  it('leaves the second column blank for a single odd leftover', () => {
    const items = ['a', 'b', 'c']
    const pages = groupIntoTwoUp(items)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toEqual({ first: 'a', second: 'b' })
    expect(pages[1]).toEqual({ first: 'c', second: null })
  })

  it('keeps a single invoice on its own page with a blank second column', () => {
    expect(groupIntoTwoUp(['a'])).toEqual([{ first: 'a', second: null }])
  })

  it('returns no pages for an empty selection', () => {
    expect(groupIntoTwoUp([])).toEqual([])
  })

  it('preserves the original invoice order across pages', () => {
    const items = [1, 2, 3, 4, 5]
    const flattened = groupIntoTwoUp(items).flatMap((p) => [p.first, p.second].filter((x): x is number => x !== null))
    expect(flattened).toEqual(items)
  })
})

describe('planInvoicePages split', () => {
  it('reserves the first invoice for the load form page and pairs the rest', () => {
    const plan = planInvoicePages(['a', 'b', 'c', 'd', 'e'])
    expect(plan.leading).toBe('a')
    expect(plan.pages).toEqual([
      { first: 'b', second: 'c' },
      { first: 'd', second: 'e' },
    ])
  })

  it('keeps only the leading invoice when there is no remainder', () => {
    expect(planInvoicePages(['a'])).toEqual({ leading: 'a', pages: [] })
  })

  it('leaves a blank second column for an odd remainder', () => {
    const plan = planInvoicePages(['a', 'b', 'c', 'd'])
    expect(plan.leading).toBe('a')
    expect(plan.pages).toEqual([
      { first: 'b', second: 'c' },
      { first: 'd', second: null },
    ])
  })

  it('returns no leading invoice and no pages for an empty selection', () => {
    expect(planInvoicePages([])).toEqual({ leading: null, pages: [] })
  })

  it('preserves the original invoice order across the split', () => {
    const items = [1, 2, 3, 4, 5, 6]
    const plan = planInvoicePages(items)
    const flattened = [plan.leading, ...plan.pages.flatMap((p) => [p.first, p.second].filter((x): x is number => x !== null))]
    expect(flattened).toEqual(items)
  })
})

describe('load form bulk print ordering', () => {
  it('puts the load form first, then every invoice in order', () => {
    expect(bulkPrintOrder(3)).toEqual(['load-form', 'invoice', 'invoice', 'invoice'])
  })

  it('produces only the load form block when there are no invoices', () => {
    expect(bulkPrintOrder(0)).toEqual(['load-form'])
  })
})

describe('load form bulk print page count', () => {
  it('counts page one (load form + first invoice) plus two-per-page pages for the rest', () => {
    expect(planBulkPrint(0)).toEqual({ loadFormPageCount: 1, invoicePageCount: 0 })
    expect(planBulkPrint(1)).toEqual({ loadFormPageCount: 1, invoicePageCount: 0 })
    expect(planBulkPrint(2)).toEqual({ loadFormPageCount: 1, invoicePageCount: 1 })
    expect(planBulkPrint(3)).toEqual({ loadFormPageCount: 1, invoicePageCount: 1 })
    expect(planBulkPrint(4)).toEqual({ loadFormPageCount: 1, invoicePageCount: 2 })
    expect(planBulkPrint(6)).toEqual({ loadFormPageCount: 1, invoicePageCount: 3 })
    expect(planBulkPrint(7)).toEqual({ loadFormPageCount: 1, invoicePageCount: 3 })
  })
})