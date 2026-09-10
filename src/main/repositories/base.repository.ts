import { getDatabase } from '../database/connection'
import type Database from 'better-sqlite3'

export abstract class BaseRepository {
  protected get db(): Database.Database {
    return getDatabase()
  }

  runInTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }
}