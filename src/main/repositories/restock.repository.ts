import { BaseRepository } from './base.repository'
import type {
  Restock,
  RestockItem,
  RestockListItem,
  RestockItemWithProduct,
  CreateRestockDTO,
  CreateRestockItemDTO,
  UpdateRestockDTO,
} from '@shared/types/restock'

export class RestockRepository extends BaseRepository {
  findAll(): Restock[] {
    return this.db.prepare('SELECT * FROM restocks ORDER BY createdAt DESC').all() as Restock[]
  }

  findAllWithCounts(): RestockListItem[] {
    return this.db
      .prepare(
        `SELECT r.*,
                (SELECT COUNT(*) FROM restock_items i WHERE i.restockId = r.id) AS itemCount
         FROM restocks r
         ORDER BY r.createdAt DESC`
      )
      .all() as RestockListItem[]
  }

  findById(id: number): Restock | null {
    return this.db.prepare('SELECT * FROM restocks WHERE id = ?').get(id) as Restock | null
  }

  findByStatus(status: Restock['status']): Restock[] {
    return this.db
      .prepare('SELECT * FROM restocks WHERE status = ? ORDER BY createdAt DESC')
      .all(status) as Restock[]
  }

  /**
   * Next restock number from a stored counter, so numbers are never reused after a delete.
   * Call inside the same transaction as create().
   */
  generateReferenceNumber(): string {
    const maxExisting = (
      this.db
        .prepare(
          "SELECT COALESCE(MAX(CAST(SUBSTR(referenceNumber, 4) AS INTEGER)), 0) AS maxNo FROM restocks WHERE referenceNumber LIKE 'RS-%'"
        )
        .get() as { maxNo: number }
    ).maxNo
    const counter = this.db
      .prepare("SELECT value FROM settings WHERE key = 'restock_next_number'")
      .get() as { value: string } | undefined
    const next = Math.max(Number(counter?.value) || 0, maxExisting + 1)
    this.db
      .prepare(
        `INSERT INTO settings (key, value, type) VALUES ('restock_next_number', ?, 'number')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = datetime('now')`
      )
      .run(String(next + 1))
    return `RS-${String(next).padStart(6, '0')}`
  }

  create(data: CreateRestockDTO, referenceNumber: string): Restock {
    const totalCost = data.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)

    const result = this.db.prepare(
      'INSERT INTO restocks (referenceNumber, supplierName, date, totalCost, status, notes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(referenceNumber, data.supplierName, data.date, totalCost, 'pending', data.notes ?? null)

    const restockId = result.lastInsertRowid as number

    for (const item of data.items) {
      this.createItem(restockId, item)
    }

    return this.findById(restockId)!
  }

  createItem(restockId: number, item: CreateRestockItemDTO): RestockItem {
    const totalCost = item.quantity * item.unitCost

    const result = this.db
      .prepare(
        'INSERT INTO restock_items (restockId, productId, unit, quantity, unitCost, totalCost) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(restockId, item.productId, item.unit ?? 'piece', item.quantity, item.unitCost, totalCost)

    return this.db.prepare('SELECT * FROM restock_items WHERE id = ?').get(result.lastInsertRowid) as RestockItem
  }

  getItems(restockId: number): RestockItem[] {
    return this.db
      .prepare('SELECT * FROM restock_items WHERE restockId = ?')
      .all(restockId) as RestockItem[]
  }

  getItemsWithProduct(restockId: number): RestockItemWithProduct[] {
    return this.db
      .prepare(
        `SELECT i.*, p.name AS productName, p.sku AS productSku
         FROM restock_items i
         JOIN products p ON p.id = i.productId
         WHERE i.restockId = ?
         ORDER BY i.id ASC`
      )
      .all(restockId) as RestockItemWithProduct[]
  }

  update(id: number, data: UpdateRestockDTO & { status?: Restock['status'] }): Restock {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.supplierName !== undefined) { fields.push('supplierName = ?'); values.push(data.supplierName) }
    if (data.date !== undefined) { fields.push('date = ?'); values.push(data.date) }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status) }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes) }

    if (fields.length > 0) {
      fields.push("updatedAt = datetime('now')")
      values.push(id)
      this.db.prepare(`UPDATE restocks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    if (data.items) {
      this.db.prepare('DELETE FROM restock_items WHERE restockId = ?').run(id)
      for (const item of data.items) {
        this.createItem(id, item)
      }

      const newTotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
      this.db.prepare("UPDATE restocks SET totalCost = ?, updatedAt = datetime('now') WHERE id = ?").run(newTotal, id)
    }

    return this.findById(id)!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM restock_items WHERE restockId = ?').run(id)
    this.db.prepare('DELETE FROM restocks WHERE id = ?').run(id)
  }

  countItemsByProductId(productId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM restock_items WHERE productId = ?')
      .get(productId) as { count: number }
    return result.count
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM restocks').get() as { count: number }).count
  }

  findRangeWithCounts(from: string, to: string): Array<{
    restockId: number
    referenceNumber: string
    supplierName: string
    date: string
    itemCount: number
    totalCost: number
    status: Restock['status']
  }> {
    return this.db
      .prepare(
        `SELECT r.id AS restockId,
                r.referenceNumber,
                r.supplierName,
                r.date,
                (SELECT COUNT(*) FROM restock_items i WHERE i.restockId = r.id) AS itemCount,
                r.totalCost,
                r.status
         FROM restocks r
         WHERE r.date >= ? AND r.date <= ?
         ORDER BY r.date DESC`
      )
      .all(from, to) as Array<{
      restockId: number
      referenceNumber: string
      supplierName: string
      date: string
      itemCount: number
      totalCost: number
      status: Restock['status']
    }>
  }
}
