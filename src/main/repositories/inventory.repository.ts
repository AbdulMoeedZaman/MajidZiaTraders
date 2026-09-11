import { BaseRepository } from './base.repository'
import type { StockMovement, RecordMovementDTO, StockMovementWithContext } from '@shared/types/inventory'
import type { StockMovementReportItem } from '@shared/types/report'

export class InventoryRepository extends BaseRepository {
  findByProductId(productId: number): StockMovement[] {
    return this.db
      .prepare('SELECT * FROM stock_movements WHERE productId = ? ORDER BY id DESC')
      .all(productId) as StockMovement[]
  }

  findMovementsWithContext(productId: number): StockMovementWithContext[] {
    return this.db
      .prepare(
        `SELECT m.*,
                inv.invoiceNumber AS invoiceNumber,
                cus.name AS customerName,
                res.supplierName AS supplierName
         FROM stock_movements m
         LEFT JOIN invoices inv ON m.referenceType = 'invoice' AND inv.id = m.referenceId
         LEFT JOIN customers cus ON cus.id = inv.customerId
         LEFT JOIN restocks res ON m.referenceType = 'restock' AND res.id = m.referenceId
         WHERE m.productId = ?
         ORDER BY m.createdAt DESC, m.id DESC`
      )
      .all(productId) as StockMovementWithContext[]
  }

  findMovements(from?: string, to?: string): StockMovementReportItem[] {
    return this.db
      .prepare(
        `SELECT m.id AS movementId,
                m.createdAt AS date,
                m.productId,
                p.name AS productName,
                p.sku AS productSku,
                m.type,
                m.quantity,
                m.referenceType,
                m.referenceId,
                m.reason,
                m.newQuantity,
                m.cost
         FROM stock_movements m
         JOIN products p ON p.id = m.productId
         WHERE (@from IS NULL OR date(m.createdAt, 'localtime') >= @from)
           AND (@to IS NULL OR date(m.createdAt, 'localtime') <= @to)
         ORDER BY m.createdAt DESC, m.id DESC`
      )
      .all({ from: from ?? null, to: to ?? null }) as StockMovementReportItem[]
  }

  findById(id: number): StockMovement | null {
    return this.db.prepare('SELECT * FROM stock_movements WHERE id = ?').get(id) as StockMovement | null
  }

  findLatestByProductId(productId: number): StockMovement | null {
    return this.db
      .prepare('SELECT * FROM stock_movements WHERE productId = ? ORDER BY id DESC LIMIT 1')
      .get(productId) as StockMovement | null
  }

  getCurrentQuantity(productId: number): number {
    const latest = this.findLatestByProductId(productId)
    return latest?.newQuantity ?? 0
  }

  getCurrentQuantities(productIds: number[]): Map<number, number> {
    if (productIds.length === 0) return new Map()

    const placeholders = productIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT productId, newQuantity
         FROM stock_movements
         WHERE id IN (
           SELECT MAX(id) FROM stock_movements WHERE productId IN (${placeholders}) GROUP BY productId
         )`
      )
      .all(...productIds) as Array<{ productId: number; newQuantity: number }>

    const map = new Map<number, number>()
    for (const row of rows) {
      map.set(row.productId, row.newQuantity)
    }
    return map
  }

  create(data: RecordMovementDTO): StockMovement {
    const result = this.db
      .prepare(
        `INSERT INTO stock_movements
           (productId, type, quantity, previousQuantity, newQuantity, referenceType, referenceId, reason, cost)
         SELECT
           ? AS productId,
           ? AS type,
           ? AS quantity,
           COALESCE((SELECT newQuantity FROM stock_movements WHERE productId = ? ORDER BY id DESC LIMIT 1), 0) AS previousQuantity,
           COALESCE((SELECT newQuantity FROM stock_movements WHERE productId = ? ORDER BY id DESC LIMIT 1), 0) + ? AS newQuantity,
           ? AS referenceType,
           ? AS referenceId,
           ? AS reason,
           ? AS cost`
      )
      .run(
        data.productId,
        data.type,
        data.quantity,
        data.productId,
        data.productId,
        data.quantity,
        data.referenceType ?? null,
        data.referenceId ?? null,
        data.reason ?? null,
        data.cost ?? null
      )

    return this.findById(result.lastInsertRowid as number)!
  }

  setQuantity(productId: number, quantity: number, type: string, reason?: string): StockMovement {
    const result = this.db
      .prepare(
        `INSERT INTO stock_movements
           (productId, type, quantity, previousQuantity, newQuantity, referenceType, reason)
         SELECT
           ? AS productId,
           ? AS type,
           ? - COALESCE((SELECT newQuantity FROM stock_movements WHERE productId = ? ORDER BY id DESC LIMIT 1), 0) AS quantity,
           COALESCE((SELECT newQuantity FROM stock_movements WHERE productId = ? ORDER BY id DESC LIMIT 1), 0) AS previousQuantity,
           ? AS newQuantity,
           'opening_stock' AS referenceType,
           ? AS reason`
      )
      .run(
        productId,
        type,
        quantity,
        productId,
        productId,
        quantity,
        reason ?? 'Opening stock'
      )

    return this.findById(result.lastInsertRowid as number)!
  }

  deleteById(id: number): void {
    this.db.prepare('DELETE FROM stock_movements WHERE id = ?').run(id)
  }

  countByProductId(productId: number): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS count FROM stock_movements WHERE productId = ?').get(productId) as {
        count: number
      }
    ).count
  }

  deleteByProductId(productId: number): void {
    this.db.prepare('DELETE FROM stock_movements WHERE productId = ?').run(productId)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM stock_movements').get() as { count: number }).count
  }
}