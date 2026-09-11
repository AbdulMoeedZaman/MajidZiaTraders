import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getDatabase, getDatabasePath, replaceDatabaseFromFile } from '../database/connection'
import { LATEST_MIGRATION_VERSION } from '../database/migrations/migrate'
import { backupDatabase, openReadonlyDatabase, type AppDatabase } from '../database/sqlite'
import type { BackupValidation, BackupMetadata, BackupRestoreResult } from '@shared/types/backup'

// Tables every supported backup must contain. They all exist since database version 3;
// tables added later are created by migrations when an older backup is restored.
const CORE_TABLES = [
  'business_profile',
  'settings',
  'categories',
  'products',
  'stock_movements',
  'stock_adjustments',
  'customers',
  'customer_ledger',
  'customer_payments',
  'invoices',
  'invoice_items',
  'restocks',
  'restock_items',
]

const SAFETY_COPIES_TO_KEEP = 10

function withBackupExtension(destinationPath: string): string {
  return /\.(db|sqlite3?)$/i.test(destinationPath) ? destinationPath : `${destinationPath}.db`
}

function tableNames(connection: AppDatabase): string[] {
  const rows = connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>
  return rows.map((r) => r.name)
}

function migrationVersion(connection: AppDatabase, tables: string[]): number | null {
  if (!tables.includes('_migrations')) return null
  const row = connection.prepare('SELECT MAX(version) AS version FROM _migrations').get() as { version: number | null }
  return row.version ?? null
}

function invalid(message: string): BackupValidation {
  return { valid: false, message, integrity: false, tables: [], version: null, metadata: null }
}

export class BackupService {
  async createBackup(destinationPath: string): Promise<BackupMetadata> {
    if (!destinationPath?.trim()) {
      throw new Error('Backup destination is required')
    }
    const dest = withBackupExtension(destinationPath)
    const tmp = `${dest}.${process.pid}.tmp`
    try {
      // backup() includes changes still in the WAL file, unlike a plain file copy.
      await backupDatabase(getDatabase(), tmp)
      fs.copyFileSync(tmp, dest)
    } finally {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
      } catch {
        // ignore leftover temp
      }
    }

    return this.inspect(dest, null)
  }

  validateBackup(filePath: string): BackupValidation {
    if (!fs.existsSync(filePath)) {
      return invalid('File does not exist')
    }

    let connection: AppDatabase | null = null
    try {
      connection = openReadonlyDatabase(filePath)
    } catch (error) {
      return invalid(`File is not a valid SQLite database: ${String(error)}`)
    }

    try {
      const integrityRow = connection.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
      const integrity = integrityRow?.integrity_check === 'ok'
      const tables = tableNames(connection)
      const missing = CORE_TABLES.filter((t) => !tables.includes(t))
      const version = migrationVersion(connection, tables)
      const missingHistory = version === null
      const tooNew = version !== null && version > LATEST_MIGRATION_VERSION

      let message: string
      if (!integrity) {
        message = 'Database integrity check failed'
      } else if (missing.length > 0) {
        message = `Incompatible backup: missing tables (${missing.join(', ')})`
      } else if (missingHistory) {
        message = 'Incompatible backup: missing migration history'
      } else if (tooNew) {
        message = `This backup was made by a newer version of the app (database version ${version}). Update the app to restore it.`
      } else if (version !== null && version < LATEST_MIGRATION_VERSION) {
        message = 'Backup is valid. It was made by an older version and will be upgraded when restored.'
      } else {
        message = 'Backup is valid and compatible'
      }

      return {
        valid: integrity && missing.length === 0 && !missingHistory && !tooNew,
        message,
        integrity,
        tables,
        version,
        metadata: this.inspect(filePath, connection),
      }
    } catch (error) {
      return invalid(`Unable to read backup: ${String(error)}`)
    } finally {
      connection.close()
    }
  }

  async restoreBackup(filePath: string): Promise<BackupRestoreResult> {
    const validation = this.validateBackup(filePath)
    if (!validation.valid) {
      throw new Error(`Cannot restore backup: ${validation.message}`)
    }

    const safetyCopyPath = await this.createSafetyCopy()

    try {
      // Reopening the database runs migrations, which upgrades backups from older versions.
      replaceDatabaseFromFile(filePath, safetyCopyPath)
    } catch (error) {
      throw new Error(
        `Restore failed and the previous database was put back: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const check = this.validateBackup(getDatabasePath())
    return {
      success: check.valid,
      message: check.valid
        ? `Backup restored. The data you had before restoring was saved to ${safetyCopyPath}`
        : check.message,
      restoredAt: new Date().toISOString(),
      safetyCopyPath,
    }
  }

  /** Complete copy of the current data (including the WAL) in userData/backups; keeps the newest few. */
  private async createSafetyCopy(): Promise<string> {
    const dir = path.join(app.getPath('userData'), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dest = path.join(dir, `before-restore-${stamp}.db`)
    await backupDatabase(getDatabase(), dest)

    const copies = fs
      .readdirSync(dir)
      .filter((f) => /^before-restore-.*\.db$/.test(f))
      .sort()
    for (const old of copies.slice(0, Math.max(0, copies.length - SAFETY_COPIES_TO_KEEP))) {
      fs.unlinkSync(path.join(dir, old))
    }
    return dest
  }

  private inspect(filePath: string, connection: AppDatabase | null): BackupMetadata {
    const stats = fs.statSync(filePath)
    let tableCount: number
    if (connection) {
      tableCount = tableNames(connection).length
    } else {
      const temp = openReadonlyDatabase(filePath)
      try {
        tableCount = tableNames(temp).length
      } finally {
        temp.close()
      }
    }
    return {
      fileName: path.basename(filePath),
      size: stats.size,
      createdAt: stats.mtime.toISOString(),
      appVersion: app.getVersion(),
      tableCount,
    }
  }
}
