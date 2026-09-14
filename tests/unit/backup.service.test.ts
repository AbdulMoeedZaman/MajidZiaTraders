import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { BackupService } from '../../src/main/services/backup.service'
import { getDatabase, getDatabasePath } from '../../src/main/database/connection'
import { AppDatabase } from '../../src/main/database/sqlite'
import { InvoiceService } from '../../src/main/services/invoice.service'
import { ProductService } from '../../src/main/services/product.service'
import { LATEST_MIGRATION_VERSION } from '../../src/main/database/migrations/migrate'
import { useTestDatabase, seedBasics, seedStocked } from './helpers'
import type { CreateInvoiceDTO } from '../../src/shared/types/invoice'

describe('BackupService', () => {
  useTestDatabase()

  const invoiceInput = (seed: ReturnType<typeof seedBasics>): CreateInvoiceDTO => ({
    customerId: seed.customerId,
    brokerId: seed.brokerId,
    date: '2026-09-10',
    filerStatus: 'filer',
    tax: null,
    items: [{ productId: seed.product.id, rate: 500, quantity: 29 }],
  })

  it('createBackup writes a file that validateBackup accepts', async () => {
    const service = new BackupService()
    seedBasics()
    const backupPath = path.join(process.env.TEST_USER_DATA!, 'backup-test.db')

    const file = await service.createBackup(backupPath)
    expect(fs.existsSync(file.path)).toBe(true)
    expect(file.size).toBeGreaterThan(0)
    expect(fs.statSync(file.path).size).toBe(file.size)
    expect(file.name).toBe('backup-test.db')

    const validation = service.validateBackup(backupPath)
    expect(validation.valid).toBe(true)
    expect(validation.version).toBe(LATEST_MIGRATION_VERSION)
  })

  it('createBackup refuses to overwrite the live database or write to a missing folder', async () => {
    const service = new BackupService()
    seedBasics()

    await expect(service.createBackup(getDatabasePath())).rejects.toThrow(
      /cannot overwrite the live database/i,
    )
    await expect(
      service.createBackup(path.join(process.env.TEST_USER_DATA!, 'no-such-folder', 'x.db')),
    ).rejects.toThrow(/does not exist/)
  })

  it('validateBackup rejects a garbage file and a backup from a newer app version', async () => {
    const service = new BackupService()
    seedBasics()

    const garbage = service.validateBackup(
      path.join(process.env.TEST_USER_DATA!, 'missing.db'),
    )
    expect(garbage.valid).toBe(false)
    expect(garbage.message).toMatch(/does not exist/)

    const garbagePath = path.join(process.env.TEST_USER_DATA!, 'garbage.db')
    fs.writeFileSync(garbagePath, 'this is definitely not a sqlite database')
    const garbage2 = service.validateBackup(garbagePath)
    expect(garbage2.valid).toBe(false)

    const backupPath = path.join(process.env.TEST_USER_DATA!, 'future.db')
    await service.createBackup(backupPath)
    const writer = new AppDatabase(backupPath)
    writer.exec("INSERT INTO _migrations (version, name) VALUES (999, 'fictional')")
    writer.close()
    const future = service.validateBackup(backupPath)
    expect(future.valid).toBe(false)
    expect(future.version).toBe(999)
    expect(future.message).toMatch(/newer version/)
  })

  it('restoreBackup replaces the live database and keeps a safety copy', async () => {
    const service = new BackupService()
    const invoices = new InvoiceService()
    const products = new ProductService()
    const seed = seedStocked(7)
    invoices.create(invoiceInput(seed))

    const backupPath = path.join(process.env.TEST_USER_DATA!, 'for-restore.db')
    await service.createBackup(backupPath)
    expect(invoices.list()).toHaveLength(1)

    // Wipe the live database directly, simulating data loss, then restore.
    const live = getDatabase()
    live.exec('DELETE FROM invoice_items')
    live.exec('DELETE FROM invoices')
    live.exec('DELETE FROM products')
    expect(invoices.list()).toHaveLength(0)
    expect(products.list()).toHaveLength(0)

    const result = await service.restoreBackup(backupPath)
    expect(result.message).toMatch(/restored/i)
    expect(result.version).toBe(LATEST_MIGRATION_VERSION)
    expect(fs.existsSync(result.safetyPath)).toBe(true)
    expect(fs.statSync(result.safetyPath).size).toBeGreaterThan(0)
    expect(result.safetyPath).toContain('before-restore-')

    // The reopened live database now has the data that was backed up.
    const restored = invoices.list()
    expect(restored).toHaveLength(1)
    expect(restored[0].date).toBe('2026-09-10')
    expect(products.list().some((p) => p.name === 'Widget 1')).toBe(true)
  })

  it('restoreBackup rejects an invalid file', async () => {
    const service = new BackupService()
    seedBasics()
    await expect(service.restoreBackup('C:\\definitely\\missing.db')).rejects.toThrow(
      /does not exist|not an MZTraders|valid/i,
    )
  })
})