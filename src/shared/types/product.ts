export interface Product {
  id: number
  sku: string
  name: string
  description: string | null
  categoryId: number | null
  unit: string
  piecesPerCarton: number
  /** Display only, e.g. "33g". Not used in calculations. */
  packSize: string | null
  /** Display only, e.g. "6x24" (informs piecesPerCarton). */
  packConfig: string | null
  /** Printed retail price per piece in minor units, nullable. */
  mrp: number | null
  /** Unit goods are bought in, default 'carton'. */
  purchaseUnit: string
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
  packSize?: string
  packConfig?: string
  mrp?: number
  purchaseUnit?: string
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
  packSize?: string | null
  packConfig?: string | null
  mrp?: number | null
  purchaseUnit?: string
  baseCostPrice?: number
  minSellingPrice?: number
  sellingPrice?: number
  reorderLevel?: number
  isActive?: number
}
