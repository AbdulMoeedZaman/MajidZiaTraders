import { describe, expect, it } from 'vitest'
import { buildCsv, slugify } from '../../src/renderer/src/lib/report'

function csvToLines(csv: string): string[] {
  return csv.replace(/^\uFEFF/, '').split(/\r\n/)
}

describe('buildCsv', () => {
  it('emits a UTF-8 BOM and one bracketed block per section', () => {
    const csv = buildCsv([
      {
        title: 'Remaining inventory',
        columns: ['Product', 'Remaining'],
        rows: [['GAUGE 2026', '50'], ['Axle Bearing 6204', '31']],
        foot: [['Total', '81']],
      },
      {
        title: 'Dispatched today',
        columns: ['Product', 'Quantity'],
        rows: [['Valve Spring', '4']],
      },
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csvToLines(csv)).toEqual([
      '[Remaining inventory]',
      'Product,Remaining',
      'GAUGE 2026,50',
      'Axle Bearing 6204,31',
      'Total,81',
      '',
      '[Dispatched today]',
      'Product,Quantity',
      'Valve Spring,4',
      '',
    ])
  })

  it('quotes and escapes commas, quotes and newlines', () => {
    const csv = buildCsv([
      {
        title: 'Customers',
        columns: ['Name', 'Note'],
        rows: [
          ['Bilal, Auto Shop', 'say "hi"'],
          ['Karachi\nLahore', 'line2'],
        ],
      },
    ])
    const lines = csvToLines(csv)
    expect(lines[1]).toBe('Name,Note')
    expect(lines[2]).toBe('"Bilal, Auto Shop","say ""hi"""')
  })
})

describe('slugify', () => {
  it('produces a safe lowercase dashed filename base', () => {
    expect(slugify('Profit by customer')).toBe('profit-by-customer')
    expect(slugify('  Axle Bearing 6204 — stock history  ')).toBe('axle-bearing-6204-stock-history')
    expect(slugify('Rs. 650.00!!')).toBe('rs-650-00')
  })
})