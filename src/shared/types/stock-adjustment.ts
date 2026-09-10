export interface StockAdjustment {
  id: number
  productId: number
  stockMovementId: number | null
  type: 'damage' | 'theft' | 'loss' | 'correction' | 'return'
  quantityAdjustment: number
  reason: string
  notes: string | null
  createdAt: string
  /** Set when the adjustment was reversed (its stock change undone by a new movement). */
  reversedAt?: string | null
  reversalMovementId?: number | null
}

export interface CreateStockAdjustmentDTO {
  productId: number
  type: 'damage' | 'theft' | 'loss' | 'correction' | 'return'
  quantityAdjustment: number
  reason: string
  notes?: string
}
