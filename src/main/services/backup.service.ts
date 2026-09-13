import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getDatabase, getDatabasePath, replaceDatabaseFromFile } from '../database/connection'
import { backupDatabase, openReadonlyDatabase } from '../database/sqlite'
import { LATEST_MIGRATION_VERSION, readSchemaVersion } from '../database/migrations/migrate'
import type {
  BackupFileInfo,
  BackupValidation,
  BackupRestoreResult,
} from '@shared/types/backup'

export class BackupService {
  /**
   * Writes an online backup of the live database (WAL-safe, no downtime) to
   * `destinationPath`. Refuses to overwrite the live database file itself.
   */
  async createBackup(destinationPath: string): Promise<BackupFileInfo> {
    const resolved = path.resolve(destinationPath)
    if (resolved.toLowerCase() === getDatabasePath().toLowerCase()) {
      throw new Error('Cannot overwrite the live database with a backup')
    }
    if (!fs.existsSync(path.dirname(resolved))) {
      throw new Error('Backup folder does not exist')
    }
    if (fs.existsSync(resolved)) {
      throw new Error('A file with that name already exists. Choose another name.')
    }

    await backupDatabase(getDatabase(), resolved)

    const stat = fs.statSync(resolved)
    return {
      name: path.basename(resolved),
      path: resolved,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
    }
  }

  /**
   * Checks a file is a real MZTraders database: passes SQLite's integrity check,
   * has _migrations records, and is not newer than the app's schema. Old versions
   * are accepted because migrations upgrade them when the file is reopened.
   */
  validateBackup(sourcePath: string): BackupValidation {
    if (!fs.existsSync(sourcePath)) {
      return { valid: false, message: 'Backup file does not exist', version: null }
    }

    let db
    try {
      db = openReadonlyDatabase(sourcePath)
    } catch {
      return { valid: false, message: 'Not a valid database file', version: null }
    }

    try {
      try {
        const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string }
        if (integrity?.integrity_check !== 'ok') {
          return { valid: false, message: 'Backup failed the integrity check', version: null }
        }
      } catch {
        return { valid: false, message: 'Backup failed the integrity check', version: null }
      }

      let version: number | null = null
      try {
        version = readSchemaVersion(db)
      } catch {
        // _migrations table missing (or unreadable)
      }
      if (version === null || version === 0) {
        return { valid: false, message: 'Not an MZTraders backup (missing migration records)', version: null }
      }
      if (version > LATEST_MIGRATION_VERSION) {
        return {
          valid: false,
          message: 'This backup was made by a newer version of the app and cannot be restored here',
          version,
        }
      }
      return { valid: true, message: 'Backup is valid', version }
    } finally {
      db.close()
    }
  }

  /**
   * Restores a validated backup. The current database is first safely copied
   * (online backup, so nothing in the WAL is lost) to userData/backups, then the
   * live database is replaced. If the restored file fails to open or migrate, the
   * safety copy is rolled back automatically.
   */
  async restoreBackup(sourcePath: string): Promise<BackupRestoreResult> {
    const validation = this.validateBackup(sourcePath)
    if (!validation.valid) {
      throw new Error(validation.message)
    }

    const backupsDir = path.join(app.getPath('userData'), 'backups')
    fs.mkdirSync(backupsDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safetyPath = path.join(backupsDir, `before-restore-${stamp}.db`)

    await backupDatabase(getDatabase(), safetyPath)
    replaceDatabaseFromFile(path.resolve(sourcePath), safetyPath)

    return { message: 'Backup restored', safetyPath, version: validation.version }
  }
}