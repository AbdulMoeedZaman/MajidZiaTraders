import { BaseRepository } from './base.repository'
import type { StockMovement, StockMovementWithProduct } from '@shared/types/stock'

const MOVEMENT_SELECT = `
  SELECT m.*,
         p.name AS productName,
         c.shopName AS customerName
  FROM stock_movements m
  JOIN products p ON p.id = m.productId
  LEFT JOIN invoices i ON m.referenceType = 'invoice' AND i.id = m.referenceId
  LEFT JOIN customers c ON c.id = i.customerId
`

export class StockRepository extends BaseRepository {
  findAllWithProduct(): StockMovementWithProduct[] {
    return this.db
      .prepare(`${MOVEMENT_SELECT} ORDER BY m.date DESC, m.id DESC`)
      .all() as StockMovementWithProduct[]
  }

  findByProduct(productId: number): StockMovementWithProduct[] {
    return this.db
      .prepare(`${MOVEMENT_SELECT} WHERE m.productId = ? ORDER BY m.date DESC, m.id DESC`)
      .all(productId) as StockMovementWithProduct[]
  }

  /** Latest running balance for a product (last row's newQuantity, ledger order). */
  lastNewQuantity(productId: number): number | null {
    const row = this.db
      .prepare('SELECT newQuantity FROM stock_movements WHERE productId = ? ORDER BY id DESC LIMIT 1')
      .get(productId) as { newQuantity: number | null } | undefined
    return row?.newQuantity ?? null
  }

  /** Latest running composition for a product (cartons + loose pieces), or zeros. */
  lastComposition(productId: number): { cartons: number; loosePieces: number; pieces: number } {
    const row = this.db
      .prepare(
        `SELECT newQuantity, newCartons, newLoosePieces
           FROM stock_movements WHERE productId = ? ORDER BY id DESC LIMIT 1`
      )
      .get(productId) as
      | { newQuantity: number | null; newCartons: number | null; newLoosePieces: number | null }
      | undefined
    return {
      cartons: row?.newCartons ?? 0,
      loosePieces: row?.newLoosePieces ?? 0,
      pieces: row?.newQuantity ?? 0,
    }
  }

  /** Current running balance for every product (used by invoice stock validation). */
  currentLevels(): Array<{ productId: number; productName: string; quantity: number; cartons: number; loosePieces: number }> {
    return this.db
      .prepare(
        `SELECT p.id AS productId, p.name AS productName,
                COALESCE((SELECT m.newQuantity FROM stock_movements m
                          WHERE m.productId = p.id ORDER BY m.id DESC LIMIT 1), 0) AS quantity,
                COALESCE((SELECT m.newCartons FROM stock_movements m
                          WHERE m.productId = p.id ORDER BY m.id DESC LIMIT 1), 0) AS cartons,
                COALESCE((SELECT m.newLoosePieces FROM stock_movements m
                          WHERE m.productId = p.id ORDER BY m.id DESC LIMIT 1), 0) AS loosePieces
         FROM products p
         ORDER BY p.name`
      )
      .all() as Array<{ productId: number; productName: string; quantity: number; cartons: number; loosePieces: number }>
  }

  findById(id: number): StockMovement | null {
    return this.db.prepare('SELECT * FROM stock_movements WHERE id = ?').get(id) as StockMovement | null
  }

  insert(row: {
    productId: number
    type: string
    quantity: number
    previousQuantity: number | null
    newQuantity: number | null
    newCartons?: number | null
    newLoosePieces?: number | null
    referenceType: string | null
    referenceId: number | null
    note: string | null
    date: string
    price: number | null
  }): StockMovement {
    const result = this.db
      .prepare(
        `INSERT INTO stock_movements
           (productId, type, quantity, previousQuantity, newQuantity, newCartons, newLoosePieces,
            referenceType, referenceId, note, date, price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.productId,
        row.type,
        row.quantity,
        row.previousQuantity,
        row.newQuantity,
        row.newCartons ?? null,
        row.newLoosePieces ?? null,
        row.referenceType,
        row.referenceId,
        row.note,
        row.date,
        row.price
      )
    return this.db
      .prepare('SELECT * FROM stock_movements WHERE id = ?')
      .get(result.lastInsertRowid as number) as StockMovement
  }

  deleteForInvoice(invoiceId: number): void {
    this.db
      .prepare("DELETE FROM stock_movements WHERE referenceType = 'invoice' AND referenceId = ?")
      .run(invoiceId)
  }

  findSalesForInvoice(invoiceId: number): StockMovement[] {
    return this.db
      .prepare(
        "SELECT * FROM stock_movements WHERE referenceType = 'invoice' AND referenceId = ? ORDER BY id ASC"
      )
      .all(invoiceId) as StockMovement[]
  }

  /** Whether a product has any stock ledger rows (blocks piecesPerCarton edits). */
  hasMovements(productId: number): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM stock_movements WHERE productId = ? LIMIT 1')
      .get(productId) as unknown
    return row !== undefined
  }
}