import { BaseRepository } from './base.repository'
import type { Customer, CreateCustomerDTO, UpdateCustomerDTO, CustomerWithRoute } from '@shared/types/customer'

export type CustomerRow = Customer

export class CustomerRepository extends BaseRepository {
  findAll(): Customer[] {
    return this.db.prepare('SELECT * FROM customers ORDER BY shopName, ownerName').all() as Customer[]
  }

  findAllWithRoute(): CustomerWithRoute[] {
    return this.db
      .prepare(
        `SELECT c.*, r.name AS routeName
         FROM customers c
         JOIN routes r ON r.id = c.routeId
         ORDER BY r.position, c.shopName, c.ownerName`
      )
      .all() as CustomerWithRoute[]
  }

  findByRoute(routeId: number): CustomerWithRoute[] {
    return this.db
      .prepare(
        `SELECT c.*, r.name AS routeName
         FROM customers c
         JOIN routes r ON r.id = c.routeId
         WHERE c.routeId = ?
         ORDER BY c.shopName, c.ownerName`
      )
      .all(routeId) as CustomerWithRoute[]
  }

  findById(id: number): Customer | null {
    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer | null
  }

  findByIdWithRoute(id: number): CustomerWithRoute | null {
    return this.db
      .prepare(
        `SELECT c.*, r.name AS routeName
         FROM customers c
         JOIN routes r ON r.id = c.routeId
         WHERE c.id = ?`
      )
      .get(id) as CustomerWithRoute | null
  }

  findByCode(code: string): Customer | null {
    return this.db.prepare('SELECT * FROM customers WHERE code = ?').get(code) as Customer | null
  }

  findByCodeExcludingId(code: string, excludeId: number): Customer | null {
    return this.db.prepare('SELECT * FROM customers WHERE code = ? AND id != ?').get(code, excludeId) as Customer | null
  }

  search(query: string): CustomerWithRoute[] {
    return this.db
      .prepare(
        `SELECT c.*, r.name AS routeName
         FROM customers c
         JOIN routes r ON r.id = c.routeId
         WHERE c.code LIKE ? OR c.shopName LIKE ? OR c.ownerName LIKE ?
           OR COALESCE(c.phone, '') LIKE ? OR COALESCE(c.address, '') LIKE ?
         ORDER BY c.shopName, c.ownerName`
      )
      .all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`) as CustomerWithRoute[]
  }

  create(data: CreateCustomerDTO): Customer {
    const result = this.db
      .prepare(
        `INSERT INTO customers (code, shopName, ownerName, phone, address, routeId, ownerId)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.code.trim(),
        data.shopName?.trim() ?? '',
        data.ownerName?.trim() ?? '',
        data.phone?.trim() || null,
        data.address?.trim() || null,
        data.routeId,
        data.ownerId ?? null
      )
    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, data: UpdateCustomerDTO): Customer {
    const fields: string[] = []
    const values: unknown[] = []
    if (data.code !== undefined) { fields.push('code = ?'); values.push(data.code.trim()) }
    if (data.shopName !== undefined) { fields.push('shopName = ?'); values.push(data.shopName?.trim() ?? '') }
    if (data.ownerName !== undefined) { fields.push('ownerName = ?'); values.push(data.ownerName?.trim() ?? '') }
    if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone?.trim() || null) }
    if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address?.trim() || null) }
    if (data.routeId !== undefined) { fields.push('routeId = ?'); values.push(data.routeId) }
    if (data.ownerId !== undefined) { fields.push('ownerId = ?'); values.push(data.ownerId ?? null) }
    if (fields.length === 0) return this.findById(id)!
    fields.push("updatedAt = datetime('now')")
    values.push(id)
    this.db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM customers WHERE id = ?').run(id)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM customers').get() as { count: number }).count
  }

  countByRoute(routeId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM customers WHERE routeId = ?')
      .get(routeId) as { count: number }
    return result.count
  }
}
