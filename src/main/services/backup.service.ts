import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getDatabase, getDatabasePath, replaceDatabaseFromFile } from '../database/connection'
import { LATEST_MIGRATION_VERSION } from '../database/migrations/migrate'
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

function tableNames(connection: Database.Database): string[] {
  const rows = connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>
  return rows.map((r) => r.name)
}

function migrationVersion(connection: Database.Database, tables: string[]): number | null {
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
    const dest = destinationPath.endsWith('.db') ? destinationPath : `${destinationPath}.db`
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest)
    }

    // db.backup() includes changes still in the WAL file, unlike a plain file copy.
    await getDatabase().backup(dest)

    return this.inspect(dest, null)
  }

  validateBackup(filePath: string): BackupValidation {
    if (!fs.existsSync(filePath)) {
      return invalid('File does not exist')
    }

    let connection: Database.Database | null = null
    try {
      connection = new Database(filePath, { readonly: true, fileMustExist: true })
    } catch (error) {
      return invalid(`File is not a valid SQLite database: ${String(error)}`)
    }

    try {
      const integrityRow = connection.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
      const integrity = integrityRow?.integrity_check === 'ok'
      const tables = tableNames(connection)
      const missing = CORE_TABLES.filter((t) => !tables.includes(t))
      const version = migrationVersion(connection, tables)
      const tooNew = version !== null && version > LATEST_MIGRATION_VERSION

      let message: string
      if (!integrity) {
        message = 'Database integrity check failed'
      } else if (missing.length > 0) {
        message = `Incompatible backup: missing tables (${missing.join(', ')})`
      } else if (tooNew) {
        message = `This backup was made by a newer version of the app (database version ${version}). Update the app to restore it.`
      } else if (version !== null && version < LATEST_MIGRATION_VERSION) {
        message = 'Backup is valid. It was made by an older version and will be upgraded when restored.'
      } else {
        message = 'Backup is valid and compatible'
      }

      return {
        valid: integrity && missing.length === 0 && !tooNew,
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

    // Reopening the database runs migrations, which upgrades backups from older versions.
    replaceDatabaseFromFile(filePath)

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
    await getDatabase().backup(dest)

    const copies = fs
      .readdirSync(dir)
      .filter((f) => /^before-restore-.*\.db$/.test(f))
      .sort()
    for (const old of copies.slice(0, Math.max(0, copies.length - SAFETY_COPIES_TO_KEEP))) {
      fs.unlinkSync(path.join(dir, old))
    }
    return dest
  }

  private inspect(filePath: string, connection: Database.Database | null): BackupMetadata {
    const stats = fs.statSync(filePath)
    let tableCount: number
    if (connection) {
      tableCount = tableNames(connection).length
    } else {
      const temp = new Database(filePath, { readonly: true })
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
