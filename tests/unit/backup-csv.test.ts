import fs from 'fs'
import path from 'path'
import { AppDatabase, openReadonlyDatabase } from '../../src/main/database/sqlite'
import { describe, expect, it } from 'vitest'
import { BackupService } from '../../src/main/services/backup.service'
import { CSVService } from '../../src/main/services/csv.service'
import { ProductService } from '../../src/main/services/product.service'
import { CustomerService } from '../../src/main/services/customer.service'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { LATEST_MIGRATION_VERSION } from '../../src/main/database/migrations/migrate'
import { getDatabase } from '../../src/main/database/connection'
import { assertUserFilePath } from '../../src/main/ipc/path-guard'
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
    const future = new AppDatabase(file)
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
    const safety = openReadonlyDatabase(result.safetyCopyPath!)
    expect(safety.prepare("SELECT COUNT(*) AS n FROM products WHERE sku = 'SAFE-1'").get()).toEqual({ n: 1 })
    safety.close()

    // The restored (empty, v3) data is now in use and was upgraded by the migrations.
    expect(new ProductService().list()).toEqual([])
    const version = getDatabase().prepare('SELECT MAX(version) AS v FROM _migrations').get() as { v: number }
    expect(version.v).toBe(LATEST_MIGRATION_VERSION)
  })

  it('rejects a backup that has the core tables but no migration history', () => {
    const file = copyFixture('no-history.db')
    const stripped = new AppDatabase(file)
    stripped.exec('DROP TABLE _migrations')
    stripped.close()

    const result = new BackupService().validateBackup(file)
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/migration history/)
  })

  it('keeps a .sqlite destination extension instead of appending .db', async () => {
    const dest = path.join(db.dir(), 'copy.sqlite')
    const meta = await new BackupService().createBackup(dest)
    expect(fs.existsSync(dest)).toBe(true)
    expect(fs.existsSync(`${dest}.db`)).toBe(false)
    expect(meta.fileName).toBe('copy.sqlite')
  })

  it('rejects a backup path inside the app data folder even when the casing differs', () => {
    const sneaky = path.join(db.dir().toUpperCase(), 'x.db')
    expect(() => assertUserFilePath(sneaky, ['.db'], 'Backup')).toThrow(/data folder/)
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

  it('escapes formula-like cells so Excel will not run them', () => {
    new CustomerService().create({ name: '=cmd|calc', notes: '+1+1', address: '@SUM(1)' })
    const file = path.join(db.dir(), 'customers.csv')
    new CSVService().export({
      entityType: 'customers',
      filePath: file,
      delimiter: ',',
      encoding: 'utf8',
      includeHeaders: true,
      columns: ['name', 'notes', 'address'],
    })
    const body = fs.readFileSync(file, 'utf8')
    expect(body).toContain("'=cmd|calc")
    expect(body).toContain("'+1+1")
    expect(body).toContain("'@SUM(1)")
    expect(body).not.toMatch(/(?:^|,)=cmd/m)
  })

  it('writes an empty file when headers are off and there are no rows', () => {
    const file = path.join(db.dir(), 'empty.csv')
    new CSVService().export({
      entityType: 'products',
      filePath: file,
      delimiter: ',',
      encoding: 'utf8',
      includeHeaders: false,
      columns: ['sku', 'name'],
    })
    expect(fs.readFileSync(file, 'utf8')).toBe('')
  })

  it('reports import errors using the original file line number, including blank lines', () => {
    const file = path.join(db.dir(), 'blank-lines.csv')
    fs.writeFileSync(file, 'name,phone\n\n,5551234567\n')
    const result = new CSVService().import({
      entityType: 'customers',
      filePath: file,
      delimiter: ',',
      hasHeader: true,
      encoding: 'utf8',
      columnMappings: [
        { sourceColumn: 'name', targetField: 'name' },
        { sourceColumn: 'phone', targetField: 'phone' },
      ],
    })
    expect(result.imported).toBe(0)
    expect(result.errors).toEqual([{ row: 3, message: 'Name is required' }])
  })

  it('applies an invoice date filter when only the start date is set', () => {
    const { product, customerId } = seedBasics()
    const invoices = new InvoiceService()
    invoices.create({ customerId, date: '2026-01-01', items: [line(product, 1)] })
    invoices.create({ customerId, date: '2026-09-01', items: [line(product, 1)] })
    const file = path.join(db.dir(), 'invoices-from.csv')
    new CSVService().export({
      entityType: 'invoices',
      filePath: file,
      delimiter: ',',
      encoding: 'utf8',
      includeHeaders: true,
      columns: ['invoiceNumber', 'date'],
      filters: { from: '2026-08-01' },
    })
    const text = fs.readFileSync(file, 'utf8')
    expect(text).toContain('2026-09-01')
    expect(text).not.toContain('2026-01-01')
  })
})
