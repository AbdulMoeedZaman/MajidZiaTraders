export interface Product {
  id: number
  sku: string
  name: string
  categoryId: number | null
  unit: string
  piecesPerCarton: number
  /** Printed retail price per piece in minor units, nullable. */
  mrp: number | null
  baseCostPrice: number
  minSellingPrice: number
  sellingPrice: number
  reorderLevel: number
  isActive: number
  createdAt: string
  updatedAt: string
}

export interface CreateProductDTO {
  sku: string
  name: string
  categoryId?: number
  unit?: string
  piecesPerCarton?: number
  mrp?: number
  baseCostPrice?: number
  minSellingPrice?: number
  sellingPrice?: number
  reorderLevel?: number
}

export interface UpdateProductDTO {
  sku?: string
  name?: string
  categoryId?: number
  unit?: string
  piecesPerCarton?: number
  mrp?: number | null
  baseCostPrice?: number
  minSellingPrice?: number
  sellingPrice?: number
  reorderLevel?: number
  isActive?: number
}
