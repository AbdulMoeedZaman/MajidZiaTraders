import { BaseRepository } from './base.repository'
import type {
  Customer,
  CreateCustomerDTO,
  UpdateCustomerDTO,
  CustomerLedgerTotals,
} from '@shared/types/customer'

export type CustomerWithTotals = Customer & CustomerLedgerTotals

export class CustomerRepository extends BaseRepository {
  findAll(): Customer[] {
    return this.db.prepare('SELECT * FROM customers ORDER BY name').all() as Customer[]
  }

  findAllWithTotals(): CustomerWithTotals[] {
    return this.db
      .prepare(
        `SELECT c.*,
                COALESCE(SUM(l.debit), 0) AS totalDebit,
                COALESCE(SUM(l.credit), 0) AS totalCredit
         FROM customers c
         LEFT JOIN customer_ledger l ON l.customerId = c.id
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

  search(query: string): Customer[] {
    return this.db
      .prepare(
        `SELECT * FROM customers
         WHERE name LIKE ? OR COALESCE(address, '') LIKE ?
         ORDER BY name`
      )
      .all(`%${query}%`, `%${query}%`) as Customer[]
  }

  create(data: CreateCustomerDTO): Customer {
    const result = this.db
      .prepare(
        'INSERT INTO customers (name, address) VALUES (?, ?)'
      )
      .run(
        data.name.trim(),
        data.address?.trim() || null
      )

    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, data: UpdateCustomerDTO): Customer {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()) }
    if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address?.trim() || null) }

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
}