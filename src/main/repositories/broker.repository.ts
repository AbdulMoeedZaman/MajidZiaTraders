import { BaseRepository } from './base.repository'
import type { Broker, CreateBrokerDTO, UpdateBrokerDTO } from '@shared/types/broker'

export class BrokerRepository extends BaseRepository {
  findAll(): Broker[] {
    return this.db.prepare('SELECT * FROM brokers ORDER BY name').all() as Broker[]
  }

  findById(id: number): Broker | null {
    return this.db.prepare('SELECT * FROM brokers WHERE id = ?').get(id) as Broker | null
  }

  findByName(name: string): Broker | null {
    return this.db.prepare('SELECT * FROM brokers WHERE name = ?').get(name) as Broker | null
  }

  findByNameExcludingId(name: string, excludeId: number): Broker | null {
    return this.db.prepare('SELECT * FROM brokers WHERE name = ? AND id != ?').get(name, excludeId) as Broker | null
  }

  create(data: CreateBrokerDTO): Broker {
    const result = this.db
      .prepare('INSERT INTO brokers (name, phone) VALUES (?, ?)')
      .run(data.name.trim(), data.phone?.trim() || null)
    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, data: UpdateBrokerDTO): Broker {
    const fields: string[] = []
    const values: unknown[] = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()) }
    if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone?.trim() || null) }
    if (fields.length === 0) return this.findById(id)!
    fields.push("updatedAt = datetime('now')")
    values.push(id)
    this.db.prepare(`UPDATE brokers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM brokers WHERE id = ?').run(id)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM brokers').get() as { count: number }).count
  }
}