import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { runMigrations } from './migrations/migrate'

let db: Database.Database | null = null
let dbPath: string | null = null

export function getDatabase(): Database.Database {
  if (db) return db

  dbPath = path.join(app.getPath('userData'), 'inventory.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)

  return db
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
  if (dbPath) {
    for (const suffix of ['-wal', '-shm']) {
      const candidate = dbPath + suffix
      if (fs.existsSync(candidate)) {
        try {
          fs.unlinkSync(candidate)
        } catch {
          // best effort cleanup
        }
      }
    }
  }
}

export function replaceDatabaseFromFile(sourcePath: string): void {
  closeDatabase()
  if (!dbPath) dbPath = path.join(app.getPath('userData'), 'inventory.db')
  fs.copyFileSync(sourcePath, dbPath)
  getDatabase()
}