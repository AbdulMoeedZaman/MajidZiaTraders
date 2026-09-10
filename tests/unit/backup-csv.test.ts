import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { BackupService } from '../../src/main/services/backup.service'
import { CSVService } from '../../src/main/services/csv.service'
import { ProductService } from '../../src/main/services/product.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { LATEST_MIGRATION_VERSION } from '../../src/main/database/migrations/migrate'
import { getDatabase } from '../../src/main/database/connection'
import { localDate } from '../../src/shared/date'
import { FIXTURE_V3_BACKUP, line, seedBasics, useTestDatabase } from './helpers'

const db = useTestDatabase()

function copyFixture(name: string): string {
  const dest = path.join(db.dir(), name)
  fs.copyFileSync(FIXTURE_V3_BACKUP, dest)
  return dest
}

describe('backups', () => {
  it('accepts a backup made by the previous version (before migration 004)', () => {
    const result = new BackupService().validateBackup(FIXTURE_V3_BACKUP)
    expect(result).toMatchObject({ valid: true, version: 3 })
  })

  it('rejects a backup made by a newer version of the app', () => {
    const file = copyFixture('future.db')
    const future = new Database(file)
    future.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(999, 'from the future')
    future.close()

    const result = new BackupService().validateBackup(file)
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/newer version/)
  })

  it('restores an older backup, upgrades it, and first saves a complete safety copy', async () => {
    // Written just now, so it still lives in the WAL file — a plain file copy would miss it.
    new ProductService().create({ sku: 'SAFE-1', name: 'Made just before restoring' })

    const result = await new BackupService().restoreBackup(copyFixture('old-backup.db'))

    expect(result.success).toBe(true)
    expect(result.safetyCopyPath).toBeTruthy()
    expect(path.dirname(result.safetyCopyPath!)).toBe(path.join(db.dir(), 'backups'))
    const safety = new Database(result.safetyCopyPath!, { readonly: true })
    expect(safety.prepare("SELECT COUNT(*) AS n FROM products WHERE sku = 'SAFE-1'").get()).toEqual({ n: 1 })
    safety.close()

    // The restored (empty, v3) data is now in use and was upgraded by the migrations.
    expect(new ProductService().list()).toEqual([])
    const version = getDatabase().prepare('SELECT MAX(version) AS v FROM _migrations').get() as { v: number }
    expect(version.v).toBe(LATEST_MIGRATION_VERSION)
  })
})

describe('CSV', () => {
  it('exports product prices as money that imports back unchanged', () => {
    const products = new ProductService()
    products.create({ sku: 'CSV-1', name: 'Round trip', baseCostPrice: 150, minSellingPrice: 199, sellingPrice: 250 })
    const file = path.join(db.dir(), 'products.csv')
    const csv = new CSVService()
    csv.export({
      entityType: 'products',
      filePath: file,
      delimiter: ',',
      encoding: 'utf8',
      includeHeaders: true,
      columns: ['sku', 'name', 'unit', 'baseCostPrice', 'minSellingPrice', 'sellingPrice', 'reorderLevel'],
    })
    expect(fs.readFileSync(file, 'utf8')).toContain('CSV-1,Round trip,piece,1.50,1.99,2.50,0')

    products.delete(products.getBySku('CSV-1')!.id)
    const preview = csv.preview(file, ',', true)
    const result = csv.import({
      entityType: 'products',
      filePath: file,
      delimiter: ',',
      hasHeader: true,
      encoding: 'utf8',
      columnMappings: preview.columns.map((c) => ({ sourceColumn: c, targetField: c })),
    })
    expect(result).toMatchObject({ imported: 1, skipped: 0 })
    expect(products.getBySku('CSV-1')).toMatchObject({ baseCostPrice: 150, minSellingPrice: 199, sellingPrice: 250 })
  })

  it('exports the invoice discount as money like the other amounts', () => {
    const { product, customerId } = seedBasics()
    new InvoiceService().create({ customerId, date: localDate(), discount: 500, items: [line(product, 2)] })
    const file = path.join(db.dir(), 'invoices.csv')
    new CSVService().export({
      entityType: 'invoices',
      filePath: file,
      delimiter: ',',
      encoding: 'utf8',
      includeHeaders: true,
      columns: ['invoiceNumber', 'subtotal', 'discount', 'total'],
    })
    const [, row] = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    expect(row.split(',').slice(1)).toEqual(['20.00', '5.00', '15.00'])
  })
})
