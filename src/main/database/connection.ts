import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { runMigrations } from './migrations/migrate'
import { AppDatabase } from './sqlite'

let db: AppDatabase | null = null
let dbPath: string | null = null

export function getDatabase(): AppDatabase {
  if (db) return db

  dbPath = path.join(app.getPath('userData'), 'inventory.db')
  const connection = new AppDatabase(dbPath)
  connection.exec('PRAGMA journal_mode = WAL')
  connection.exec('PRAGMA foreign_keys = ON')
  runMigrations(connection)
  db = connection
  return connection
}

export function getDatabasePath(): string {
  if (!dbPath) {
    dbPath = path.join(app.getPath('userData'), 'inventory.db')
  }
  return dbPath
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

function removeWalSidecars(filePath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const candidate = filePath + suffix
    if (fs.existsSync(candidate)) {
      try {
        fs.unlinkSync(candidate)
      } catch {
        // best effort; a leftover sidecar would be applied to the wrong database
      }
    }
  }
}

/**
 * Replaces the live database with `sourcePath`. If opening/migrating the new file fails
 * and `fallbackPath` is set, the fallback is copied back so the previous data stays live.
 */
export function replaceDatabaseFromFile(sourcePath: string, fallbackPath?: string): void {
  closeDatabase()
  if (!dbPath) dbPath = path.join(app.getPath('userData'), 'inventory.db')
  removeWalSidecars(dbPath)
  fs.copyFileSync(sourcePath, dbPath)
  try {
    getDatabase()
  } catch (error) {
    closeDatabase()
    if (fallbackPath && fs.existsSync(fallbackPath)) {
      try {
        removeWalSidecars(dbPath)
        fs.copyFileSync(fallbackPath, dbPath)
        getDatabase()
      } catch {
        // Keep the original restore error if rolling back also fails.
      }
    }
    throw error
  }
}
