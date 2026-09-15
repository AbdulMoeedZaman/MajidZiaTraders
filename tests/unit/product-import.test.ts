import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { ProductService } from '../../src/main/services/product.service'
import { StockService } from '../../src/main/services/stock.service'
import { useTestDatabase } from './helpers'

describe('ProductService.importFromCsv', () => {
  useTestDatabase()

  const csv = [
    'Description,Retail Price per carton Exclusive of Sales Tax,Total Retail Value',
    'Wheatable High Fiber SP 64.8g 6x18 Rs.50,4576.27,22881.35',
    'Bakeri Butter SP 33g 6x24 Rs.50,6101.69,61016.9',
    'TUC FP 80.96g 1x96 Rs.100,8135.59,40677.95',
    'Gala Egg FP 94g 96x1 Rs 90,7322.03,36610.15',
    'NoPattern Product,5000,5000',
    '"Foo X, something 6x18 Rs.10",1000,2000',
    'Wheatable High Fiber SP 64.8g 6x18 Rs.50,9999,59994',
    'BadRate,X,1',
    ',100,1',
  ].join('\n')

  it('imports products from the sales-order CSV without touching the stock ledger', () => {
    const service = new ProductService()
    const csvPath = path.join(process.env.TEST_USER_DATA!, 'order.csv')
    fs.writeFileSync(csvPath, csv, 'utf8')

    const result = service.importFromCsv(csvPath)

    expect(result.created).toBe(6)
    expect(result.skippedDuplicate).toBe(1)
    expect(result.skippedInvalid).toBe(2)

    const byName = Object.fromEntries(result.products.map((p) => [p.name, p]))
    // Rate decimals are trimmed (4576.27 → Rs. 4576), never rounded.
    expect(byName['Wheatable High Fiber SP 64.8g 6x18 Rs.50'].rate).toBe(457600)
    expect(byName['Wheatable High Fiber SP 64.8g 6x18 Rs.50'].piecesPerCarton).toBe(18)
    expect(byName['Bakeri Butter SP 33g 6x24 Rs.50'].piecesPerCarton).toBe(24)
    expect(byName['Bakeri Butter SP 33g 6x24 Rs.50'].rate).toBe(610100) // 6101.69 → 6101
    expect(byName['TUC FP 80.96g 1x96 Rs.100'].piecesPerCarton).toBe(96)
    expect(byName['TUC FP 80.96g 1x96 Rs.100'].rate).toBe(813500) // 8135.59 → 8135
    expect(byName['Gala Egg FP 94g 96x1 Rs 90'].piecesPerCarton).toBe(1)
    expect(byName['Gala Egg FP 94g 96x1 Rs 90'].rate).toBe(732200) // 7322.03 → 7322
    expect(byName['NoPattern Product'].piecesPerCarton).toBe(1)
    expect(byName['NoPattern Product'].rate).toBe(500000)
    expect(byName['Foo X, something 6x18 Rs.10'].rate).toBe(100000)

    expect(service.list()).toHaveLength(6)
    expect(new StockService().list()).toHaveLength(0)
  })

  it('fails clearly on a missing or header-only CSV', () => {
    const service = new ProductService()
    expect(() =>
      service.importFromCsv(path.join(process.env.TEST_USER_DATA!, 'missing.csv')),
    ).toThrow(/ENOENT|no such file/)

    const empty = path.join(process.env.TEST_USER_DATA!, 'empty.csv')
    fs.writeFileSync(empty, 'Description,Retail Price per carton Exclusive of Sales Tax\n', 'utf8')
    expect(() => service.importFromCsv(empty)).toThrow(/no data rows/)
  })
})