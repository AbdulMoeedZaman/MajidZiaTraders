import fs from 'fs'
import path from 'path'
import { AppDatabase, openReadonlyDatabase } from '../../src/main/database/sqlite'
import { describe, expect, it } from 'vitest'
import { BackupService } from '../../src/main/services/backup.service'
import { ProductService } from '../../src/main/services/product.service'
import { LATEST_MIGRATION_VERSION } from '../../src/main/database/migrations/migrate'
import { getDatabase } from '../../src/main/database/connection'
import { assertUserFilePath } from '../../src/main/ipc/path-guard'
import { FIXTURE_V3_BACKUP, useTestDatabase } from './helpers'

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
