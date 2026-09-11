import { BaseRepository } from './base.repository'
import type { Setting, UpdateSettingDTO, BulkUpdateSettingsDTO } from '@shared/types/setting'

export class SettingsRepository extends BaseRepository {
  findAll(): Setting[] {
    return this.db.prepare('SELECT * FROM settings ORDER BY key').all() as Setting[]
  }

  findByKey(key: string): Setting | null {
    return this.db.prepare('SELECT * FROM settings WHERE key = ?').get(key) as Setting | null
  }

  getValue(key: string): string | null {
    const setting = this.findByKey(key)
    return setting?.value ?? null
  }

  upsert(key: string, value: string, type: string): Setting {
    const existing = this.findByKey(key)
    if (existing) {
      this.db.prepare("UPDATE settings SET value = ?, updatedAt = datetime('now') WHERE key = ?").run(value, key)
      return this.findByKey(key)!
    }

    const result = this.db
      .prepare('INSERT INTO settings (key, value, type) VALUES (?, ?, ?)')
      .run(key, value, type)

    return this.db.prepare('SELECT * FROM settings WHERE id = ?').get(result.lastInsertRowid) as Setting
  }

  update(key: string, data: UpdateSettingDTO): Setting {
    const existing = this.findByKey(key)
    if (!existing) {
      throw new Error(`Setting "${key}" not found`)
    }

    this.db.prepare("UPDATE settings SET value = ?, updatedAt = datetime('now') WHERE key = ?").run(data.value, key)
    return this.findByKey(key)!
  }

  bulkUpdate(data: BulkUpdateSettingsDTO): void {
    const stmt = this.db.prepare("UPDATE settings SET value = ?, updatedAt = datetime('now') WHERE key = ?")
    this.runInTransaction(() => {
      for (const setting of data.settings) {
        stmt.run(setting.value, setting.key)
      }
    })
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }
}
