import { getDatabase } from '../database/connection'
import { runInTransaction, type AppDatabase } from '../database/sqlite'

export abstract class BaseRepository {
  protected get db(): AppDatabase {
    return getDatabase()
  }

  runInTransaction<T>(fn: () => T): T {
    return runInTransaction(this.db, fn)
  }
}
