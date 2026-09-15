import fs from 'fs'
import { describe, expect, it } from 'vitest'
import { DataTransferService } from '../../src/main/services/data-transfer.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { ProductService } from '../../src/main/services/product.service'
import { CustomerService } from '../../src/main/services/customer.service'
import { RouteRepository } from '../../src/main/repositories/route.repository'
import { parseCsv } from '../../src/shared/csv'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'
import { routeIdFor, seedStocked, useTestDatabase } from './helpers'

describe('DataTransferService', () => {
  useTestDatabase()

  const service = new DataTransferService()
  const writeCsv = (name: string, csv: string): string => {
    const filePath = `${process.env.TEST_USER_DATA!}/${name}`
    fs.writeFileSync(filePath, csv, 'utf8')
    return filePath
  }

  it('generates header-only templates with required markers', () => {
    const t = service.template('products')
    expect(t.filename).toBe('products.csv')
    expect(t.csv.startsWith('\uFEFF')).toBe(true)
    const rows = parseCsv(t.csv.replace(/^\uFEFF/, ''))

    expect(rows).toEqual([['Name*', 'Minimum rate (Rs.)*', 'Sales price (Rs.)', 'Pieces per carton']])
  })

  it('exports current products with rupee money cells', () => {
    new ProductService().create({ name: 'Axle Bearing', rate: 65000, salesPrice: 70000, piecesPerCarton: 10 })

    const file = service.export('products')
    const rows = parseCsv(file.csv.replace(/^\uFEFF/, ''))

    expect(rows[0]).toEqual(['Name', 'Minimum rate (Rs.)', 'Sales price (Rs.)', 'Pieces per carton'])
    expect(rows[1]).toEqual(['Axle Bearing', '650', '700', '10'])
  })

  describe('products import', () => {
    it('creates new names and updates existing ones in place', () => {
      new ProductService().create({ name: 'Widget 1', rate: 500, piecesPerCarton: 12 })

      const csvPath = writeCsv(
        'products.csv',
        [
          'Name*,Minimum rate (Rs.)*,Sales price (Rs.),Pieces per carton',
          'Widget 1,6.00,7.00,',
          'New Part,150,180.50,24',
          ',100,,',
        ].join('\n')
      )

      const result = service.import('products', csvPath)

      expect(result.updated).toBe(1)
      expect(result.created).toBe(1)
      expect(result.failed).toBe(1)

      const productService = new ProductService()
      const widget = productService.list().find((p) => p.name === 'Widget 1')!
      expect(widget.rate).toBe(600)
      expect(widget.salesPrice).toBe(700)
      expect(widget.piecesPerCarton).toBe(12)

      const part = productService.list().find((p) => p.name === 'New Part')!
      expect(part.rate).toBe(15000)
      expect(part.salesPrice).toBe(18000) // 180.50 → Rs. 180, decimals trimmed
      expect(part.piecesPerCarton).toBe(24)
    })
  })

  describe('customers import', () => {
    it('resolves routes by day name or custom name, and updates by code', () => {
      seedStocked()
      const tuesdayId = routeIdFor('Tuesday')
      new RouteRepository().update(tuesdayId, 'Main Route')

      const csvPath = writeCsv(
        'customers.csv',
        [
          'Code*,Shop name,Owner name,Phone,Address,Route*',
          'C-001,Bilal Updated,,0322-1111111,,Wednesday',
          'C-002,New Shop,Umar,0322-2222222,Old Bazaar,Main Route',
        ].join('\n')
      )

      const result = service.import('customers', csvPath)

      expect(result.updated).toBe(1)
      expect(result.created).toBe(1)

      const customerService = new CustomerService()
      const bilal = customerService.list().find((c) => c.code === 'C-001')!
      expect(bilal.shopName).toBe('Bilal Updated')
      expect(bilal.phone).toBe('0322-1111111')

      const fresh = customerService.list().find((c) => c.code === 'C-002')!
      expect(fresh.routeId).toBe(tuesdayId)
    })

    it('fails rows whose route does not exist', () => {
      const csvPath = writeCsv(
        'customers.csv',
        [
          'Code*,Shop name,Owner name,Phone,Address,Route*',
          'C-010,Nobody,No One,,,North Pole',
        ].join('\n')
      )

      const result = service.import('customers', csvPath)
      console.log('CUST RESULT', JSON.stringify(result))

      expect(result.failed).toBe(1)
      expect(result.rows[0].reason).toContain('North Pole')
    })
  })

  describe('invoices import', () => {
    const baseCsv = (header: string[], rows: string[]): string => [header.join(','), ...rows].join('\n')

    it('imports line groups, preserves invoice numbers and advances the counter', () => {
      const seed = seedStocked(400)
      const header = [
        'Invoice number*',
        'Customer*',
        'Booker*',
        'Date*',
        'Filer status',
        'Tax (Rs.)',
        'Product*',
        'Rate (Rs.)*',
        'Quantity (pcs)*',
      ]
      const csvPath = writeCsv(
        'invoices.csv',
        baseCsv(header, [
          'INV-000010,C-001,Bashir,2026-09-01,filer,,Widget 1,5.00,24',
          'INV-000010,C-001,Bashir,2026-09-01,filer,,Widget 1,5.00,12',
          'INV-000011,C-001,Bashir,2026-09-02,non_filer,2.00,Widget 1,5.00,24',
        ])
      )

      const result = service.import('invoices', csvPath)
      console.log('INV RESULT', JSON.stringify(result))

      expect(result.created).toBe(3)
      expect(result.failed).toBe(0)

      const invoiceService = new InvoiceService()
      const invoices = invoiceService.list()
      expect(invoices.map((inv) => inv.invoiceNumber).sort()).toEqual(['INV-000010', 'INV-000011'])

      const first = invoiceService.getWithDetails(invoices.find((inv) => inv.invoiceNumber === 'INV-000010')!.id)!
      expect(first.invoice.items).toHaveLength(2)
      // Two 2-carton lines (Rs. 10 each) + one Rs. 5 line held at the Rs. 10 minimum.
      expect(first.invoice.subtotal).toBe(1000 + 1000)
      const second = invoiceService.getWithDetails(invoices.find((inv) => inv.invoiceNumber === 'INV-000011')!.id)!
      expect(second.invoice.subtotal).toBe(1000)
      expect(second.invoice.tax).toBe(0) // Rs. 2 tax rounds down to zero
      expect(second.invoice.filerStatus).toBe('non_filer')

      // Next number is pushed past the largest imported invoice number.
      const next = invoiceService.create({
        customerId: seed.customerId,
        brokerId: seed.brokerId,
        date: '2026-09-03',
        filerStatus: 'filer',
        items: [{ productId: seed.product.id, rate: 500, quantity: 12 }],
      })
      expect(next.invoiceNumber).toBe('INV-000012')
    })

    it('exports invoices one row per product line', () => {
      const seed = seedStocked(400)
      const invoiceService = new InvoiceService()
      const dto: CreateInvoiceDTO = {
        customerId: seed.customerId,
        brokerId: seed.brokerId,
        date: '2026-09-01',
        filerStatus: 'filer',
        items: [
          { productId: seed.product.id, rate: 500, quantity: 48 },
          { productId: seed.product.id, rate: 500, quantity: 6 },
        ],
      }
      invoiceService.create(dto)

      const file = service.export('invoices')
      const rows = parseCsv(file.csv.replace(/^\uFEFF/, ''))

      expect(rows[0]).toEqual([
        'Invoice number',
        'Customer',
        'Booker',
        'Date',
        'Filer status',
        'Tax (Rs.)',
        'Product',
        'Rate (Rs.)',
        'Quantity (pcs)',
      ])
      // 48 → 4 cartons × 12; 6 → 6 loose pieces.
      expect(rows[1][0]).toBe('INV-000001')
      expect(rows[1][1]).toBe('C-001')
      expect(rows[1][2]).toBe('Bashir')
      expect(rows[1][3]).toBe('2026-09-01')
      expect(rows[1][6]).toBe('Widget 1')
      expect(rows[1][7]).toBe('5')
      expect(rows[1][8]).toBe('48')
      expect(rows[2][7]).toBe('5')
      expect(rows[2][8]).toBe('6')
    })

    it('skips existing invoice numbers and duplicate numbers in the file', () => {
      const seed = seedStocked(400)
      const invoiceService = new InvoiceService()
      invoiceService.create({
        customerId: seed.customerId,
        brokerId: seed.brokerId,
        date: '2026-09-01',
        filerStatus: 'filer',
        items: [{ productId: seed.product.id, rate: 500, quantity: 12 }],
      })

      const header = ['Invoice number*', 'Customer*', 'Booker*', 'Date*', 'Product*', 'Rate (Rs.)*', 'Quantity (pcs)*']
      const csvPath = writeCsv(
        'invoices.csv',
        baseCsv(header, [
          'INV-000001,C-001,Bashir,2026-09-01,Widget 1,5.00,12',
          'INV-000020,C-001,Bashir,2026-09-01,Widget 1,5.00,12',
          'INV-000020,C-001,Bashir,2026-09-01,Widget 1,5.00,12',
        ])
      )

      const result = service.import('invoices', csvPath)

      // One invoice number = one group, so both rows of INV-000020 were
      // imported together while the already-existing INV-000001 was skipped.
      expect(result.created).toBe(2)
      expect(result.skipped).toBe(1)
      expect(result.rows.find((r) => r.status === 'skipped')?.reason).toContain('already exists')
    })

    it('reports item failures per row and skips the rest of the group', () => {
      seedStocked(100)
      const header = ['Invoice number*', 'Customer*', 'Booker*', 'Date*', 'Product*', 'Rate (Rs.)*', 'Quantity (pcs)*']
      const csvPath = writeCsv(
        'invoices.csv',
        baseCsv(header, [
          'INV-000030,C-001,Bashir,2026-09-01,Missing Product,5.00,1',
          'INV-000030,C-001,Bashir,2026-09-01,Widget 1,5.00,12',
          'INV-000031,C-001,Bashir,2026-09-01,Widget 1,6.00,9999',
        ])
      )

      const result = service.import('invoices', csvPath)
      console.log('INV RESULT', JSON.stringify(result))

      expect(result.failed).toBe(2)
      expect(result.skipped).toBe(1)
      expect(result.rows.find((r) => r.reason?.includes('Missing Product'))?.reason).toContain('not found')
      expect(result.rows.some((r) => r.status === 'failed' && r.reason?.includes('Insufficient stock'))).toBe(true)
      expect(result.rows.find((r) => r.status === 'skipped')?.reason).toContain('another line failed')
    })
  })
})