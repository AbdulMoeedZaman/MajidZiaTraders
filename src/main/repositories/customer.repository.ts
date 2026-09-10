import { BaseRepository } from './base.repository'
import type {
  Customer,
  CreateCustomerDTO,
  UpdateCustomerDTO,
  CustomerStatusFilter,
  CustomerLedgerTotals,
} from '@shared/types/customer'

export type CustomerWithTotals = Customer & CustomerLedgerTotals

export class CustomerRepository extends BaseRepository {
  findAll(): Customer[] {
    return this.db.prepare('SELECT * FROM customers ORDER BY name').all() as Customer[]
  }

  findActive(): Customer[] {
    return this.db.prepare('SELECT * FROM customers WHERE isActive = 1 ORDER BY name').all() as Customer[]
  }

  findInactive(): Customer[] {
    return this.db.prepare('SELECT * FROM customers WHERE isActive = 0 ORDER BY name').all() as Customer[]
  }

  findByStatus(filter: CustomerStatusFilter): Customer[] {
    if (filter === 'active') return this.findActive()
    if (filter === 'inactive') return this.findInactive()
    return this.findAll()
  }

  findAllWithTotals(filter: CustomerStatusFilter = 'all'): CustomerWithTotals[] {
    const where =
      filter === 'active' ? 'WHERE c.isActive = 1' : filter === 'inactive' ? 'WHERE c.isActive = 0' : ''
    return this.db
      .prepare(
        `SELECT c.*,
                COALESCE(SUM(l.debit), 0) AS totalDebit,
                COALESCE(SUM(l.credit), 0) AS totalCredit
         FROM customers c
         LEFT JOIN customer_ledger l ON l.customerId = c.id
         ${where}
         GROUP BY c.id
         ORDER BY c.name`
      )
      .all() as CustomerWithTotals[]
  }

  findById(id: number): Customer | null {
    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer | null
  }

  findByIdWithTotals(id: number): CustomerWithTotals | null {
    return this.db
      .prepare(
        `SELECT c.*,
                COALESCE(SUM(l.debit), 0) AS totalDebit,
                COALESCE(SUM(l.credit), 0) AS totalCredit
         FROM customers c
         LEFT JOIN customer_ledger l ON l.customerId = c.id
         WHERE c.id = ?
         GROUP BY c.id`
      )
      .get(id) as CustomerWithTotals | null
  }

  findByName(name: string): Customer | null {
    return this.db.prepare('SELECT * FROM customers WHERE name = ?').get(name) as Customer | null
  }

  findByNameExcludingId(name: string, excludeId: number): Customer | null {
    return this.db.prepare('SELECT * FROM customers WHERE name = ? AND id != ?').get(name, excludeId) as Customer | null
  }

  findByPhone(phone: string): Customer | null {
    return this.db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone) as Customer | null
  }

  findByPhoneExcludingId(phone: string, excludeId: number): Customer | null {
    return this.db.prepare('SELECT * FROM customers WHERE phone = ? AND id != ?').get(phone, excludeId) as Customer | null
  }

  search(query: string, status: CustomerStatusFilter = 'active'): Customer[] {
    const where =
      status === 'active'
        ? 'AND isActive = 1'
        : status === 'inactive'
          ? 'AND isActive = 0'
          : ''
    return this.db
      .prepare(
        `SELECT * FROM customers
         WHERE (name LIKE ? OR phone LIKE ? OR email LIKE ?) ${where}
         ORDER BY name`
      )
      .all(`%${query}%`, `%${query}%`, `%${query}%`) as Customer[]
  }

  create(data: CreateCustomerDTO): Customer {
    const result = this.db
      .prepare(
        'INSERT INTO customers (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        data.name.trim(),
        data.phone?.trim() || null,
        data.email?.trim().toLowerCase() || null,
        data.address?.trim() || null,
        data.notes?.trim() || null
      )

    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, data: UpdateCustomerDTO): Customer {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()) }
    if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone?.trim() || null) }
    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email?.trim().toLowerCase() || null) }
    if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address?.trim() || null) }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes?.trim() || null) }
    if (data.isActive !== undefined) { fields.push('isActive = ?'); values.push(data.isActive) }

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

  countActive(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM customers WHERE isActive = 1').get() as { count: number }).count
  }
}