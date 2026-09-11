import type { Product } from '@shared/types/product'
import type { StockAdjustment } from '@shared/types/stock-adjustment'
import type { StockMovementType } from '@shared/types/inventory'

export type ProductFormMode = 'create' | 'edit'

export interface ProductFormState {
  sku: string
  name: string
  categoryId: string
  unit: string
  piecesPerCarton: string
  mrp: string
  baseCostPrice: string
  minSellingPrice: string
  sellingPrice: string
  reorderLevel: string
}

export function toProductFormState(product: Product | null): ProductFormState {
  return {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId != null ? String(product.categoryId) : '',
    unit: product?.unit ?? 'piece',
    piecesPerCarton: product?.piecesPerCarton != null ? String(product.piecesPerCarton) : '1',
    mrp: product?.mrp != null ? String(product.mrp / 100) : '',
    baseCostPrice: product?.baseCostPrice != null ? String(product.baseCostPrice / 100) : '0',
    minSellingPrice: product?.minSellingPrice != null ? String(product.minSellingPrice / 100) : '0',
    sellingPrice: product?.sellingPrice != null ? String(product.sellingPrice / 100) : '0',
    reorderLevel: product?.reorderLevel != null ? String(product.reorderLevel) : '0',
  }
}

export function fromProductFormState(state: ProductFormState, mode: ProductFormMode) {
  const payload: Record<string, unknown> = {
    name: state.name.trim(),
    unit: state.unit.trim(),
    piecesPerCarton: Math.max(1, parseInt(state.piecesPerCarton || '1', 10) || 1),
    baseCostPrice: Math.round(parseFloat(state.baseCostPrice || '0') * 100),
    minSellingPrice: Math.round(parseFloat(state.minSellingPrice || '0') * 100),
    sellingPrice: Math.round(parseFloat(state.sellingPrice || '0') * 100),
    reorderLevel: Math.max(0, parseInt(state.reorderLevel || '0', 10) || 0),
  }

  if (state.mrp.trim()) {
    payload.mrp = Math.round(parseFloat(state.mrp) * 100)
  } else {
    payload.mrp = null
  }

  if (state.sku.trim()) payload.sku = state.sku.trim()
  if (state.categoryId) payload.categoryId = parseInt(state.categoryId, 10)

  return payload
}

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  opening_stock: 'Opening stock',
  restock: 'Restock',
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