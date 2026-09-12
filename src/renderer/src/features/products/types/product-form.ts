import type { Product } from '@shared/types/product'
import type { StockAdjustment } from '@shared/types/stock-adjustment'
import type { StockMovementType } from '@shared/types/inventory'

export type ProductFormMode = 'create' | 'edit'

export interface ProductFormState {
  sku: string
  name: string
  piecesPerCarton: string
  minSellingPrice: string
  sellingPrice: string
}

export function toProductFormState(product: Product | null): ProductFormState {
  return {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    piecesPerCarton: product?.piecesPerCarton != null ? String(product.piecesPerCarton) : '1',
    minSellingPrice: product?.minSellingPrice != null ? String(product.minSellingPrice / 100) : '0',
    sellingPrice: product?.sellingPrice != null ? String(product.sellingPrice / 100) : '0',
  }
}

export function fromProductFormState(state: ProductFormState, mode: ProductFormMode) {
  const payload: Record<string, unknown> = {
    name: state.name.trim(),
    piecesPerCarton: Math.max(1, parseInt(state.piecesPerCarton || '1', 10) || 1),
    minSellingPrice: Math.round(parseFloat(state.minSellingPrice || '0') * 100),
    sellingPrice: Math.round(parseFloat(state.sellingPrice || '0') * 100),
  }

  if (state.sku.trim()) payload.sku = state.sku.trim()

  return payload
}

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  opening_stock: 'Opening stock',
  restock: 'Add stock',
  sale: 'Sale',
  adjustment: 'Adjustment',
  damage: 'Damage',
  return: 'Return',
  other: 'Other',
}

export type AdjustmentType = StockAdjustment['type']

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  damage: 'Damage',
  theft: 'Theft',
  loss: 'Loss',
  correction: 'Correction',
  return: 'Return',
}

export const ADJUSTMENT_TYPES: AdjustmentType[] = [
  'damage',
  'theft',
  'loss',
  'correction',
  'return',
]