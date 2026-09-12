export interface Product {
  id: number
  sku: string
  name: string
  piecesPerCarton: number
  /** Floor price and cost basis for profit calculations, minor units. */
  minSellingPrice: number
  sellingPrice: number
  createdAt: string
  updatedAt: string
}

export interface CreateProductDTO {
  sku: string
  name: string
  piecesPerCarton?: number
  minSellingPrice?: number
  sellingPrice?: number
}

export interface UpdateProductDTO {
  sku?: string
  name?: string
  piecesPerCarton?: number
  minSellingPrice?: number
  sellingPrice?: number
}
