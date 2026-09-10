import { BaseRepository } from './base.repository'
import type { StockAdjustment, CreateStockAdjustmentDTO } from '@shared/types/stock-adjustment'

export class StockAdjustmentRepository extends BaseRepository {
  findAll(): StockAdjustment[] {
    return this.db.prepare('SELECT * FROM stock_adjustments ORDER BY createdAt DESC').all() as StockAdjustment[]
  }

  findById(id: number): StockAdjustment | null {
    return this.db.prepare('SELECT * FROM stock_adjustments WHERE id = ?').get(id) as StockAdjustment | null
  }

  findByProductId(productId: number): StockAdjustment[] {
    return this.db
      .prepare('SELECT * FROM stock_adjustments WHERE productId = ? ORDER BY createdAt DESC')
      .all(productId) as StockAdjustment[]
  }

  create(data: CreateStockAdjustmentDTO, stockMovementId?: number): StockAdjustment {
    const result = this.db
      .prepare(
        'INSERT INTO stock_adjustments (productId, stockMovementId, type, quantityAdjustment, reason, notes) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(data.productId, stockMovementId ?? null, data.type, data.quantityAdjustment, data.reason, data.notes ?? null)

    return this.findById(result.lastInsertRowid as number)!
  }

  markReversed(id: number, reversalMovementId: number): void {
    this.db
      .prepare("UPDATE stock_adjustments SET reversedAt = datetime('now'), reversalMovementId = ? WHERE id = ?")
      .run(reversalMovementId, id)
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM stock_adjustments WHERE id = ?').run(id)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM stock_adjustments').get() as { count: number }).count
  }

  countByProductId(productId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM stock_adjustments WHERE productId = ?')
      .get(productId) as { count: number }
    return result.count
  }
}
