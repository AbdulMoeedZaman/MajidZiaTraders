import type { Product } from './product'

export type StockMovementType =
  | 'opening_stock'
  | 'restock'
  | 'sale'
  | 'adjustment'
  | 'damage'
  | 'return'
  | 'other'

export interface StockMovement {
  id: number
  productId: number
  type: StockMovementType
  quantity: number
  previousQuantity: number
  newQuantity: number
  referenceType: string | null
  referenceId: number | null
  reason: string | null
  cost: number | null
  createdAt: string
}

export interface StockMovementWithContext extends StockMovement {
  invoiceNumber: string | null
  customerName: string | null
  supplierName: string | null
}

export interface RecordMovementDTO {
  productId: number
  type: StockMovementType
  quantity: number
  referenceType?: string
  referenceId?: number
  reason?: string
  cost?: number
}

export interface SetOpeningStockDTO {
  productId: number
  quantity: number
}

export interface ProductWithStock extends Product {
  currentStock: number
  isLowStock: boolean
  isOutOfStock: boolean
}

export interface StockSummary {
  productId: number
  currentQuantity: number
  reorderLevel: number
  isLowStock: boolean
  isOutOfStock: boolean
}

export interface BatchStockQuery {
  productIds: number[]
}
