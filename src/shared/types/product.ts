export interface Product {
  id: number
  sku: string
  name: string
  description: string | null
  categoryId: number | null
  unit: string
  piecesPerCarton: number
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
  description?: string
  categoryId?: number
  unit?: string
  piecesPerCarton?: number
  baseCostPrice?: number
  minSellingPrice?: number
  sellingPrice?: number
  reorderLevel?: number
}

export interface UpdateProductDTO {
  sku?: string
  name?: string
  description?: string
  categoryId?: number
  unit?: string
  piecesPerCarton?: number
  baseCostPrice?: number
  minSellingPrice?: number
  sellingPrice?: number
  reorderLevel?: number
  isActive?: number
}
