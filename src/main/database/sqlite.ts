import fs from 'fs'
import { backup, DatabaseSync, type SQLInputValue } from 'node:sqlite'

/** Row/query result shape compatible with the old better-sqlite3 casts in repositories. */
export interface SqlRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface SqlStatement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches prior better-sqlite3 call sites (positional + named params)
  all(...params: any[]): unknown[]
  get(...params: any[]): unknown
  run(...params: any[]): SqlRunResult
}

/** Thin wrapper so repository `as Type[]` casts stay valid without touching every file. */
export class AppDatabase {
  private readonly db: DatabaseSync

  constructor(filePath: string, options?: ConstructorParameters<typeof DatabaseSync>[1]) {
    this.db = options ? new DatabaseSync(filePath, options) : new DatabaseSync(filePath)
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string): SqlStatement {
    const stmt = this.db.prepare(sql)
    return {
      all: (...params: any[]) => stmt.all(...(params as SQLInputValue[])) as unknown[],
      get: (...params: any[]) => stmt.get(...(params as SQLInputValue[])) as unknown,
      run: (...params: any[]) => stmt.run(...(params as SQLInputValue[])) as SqlRunResult,
    }
  }

  close(): void {
    this.db.close()
  }

  /** Used by backup.service via backupDatabase(). */
  native(): DatabaseSync {
    return this.db
  }
}

export function runInTransaction<T>(db: AppDatabase, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // ignore rollback failure
    }
    throw error
  }
}

export function openReadonlyDatabase(filePath: string): AppDatabase {
  if (!fs.existsSync(filePath)) {
    throw new Error('Database file does not exist')
  }
  return new AppDatabase(filePath, { readOnly: true })
}

export async function backupDatabase(db: AppDatabase, destinationPath: string): Promise<void> {
  await backup(db.native(), destinationPath)
}
