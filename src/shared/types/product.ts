export interface Product {
  id: number
  name: string
  /** Minimum allowable rate per carton, in integer minor units (paisa / cents). */
  rate: number
  /** Number of boxes per carton. */
  piecesPerCarton: number
  createdAt: string
  updatedAt: string
}

export interface CreateProductDTO {
  name: string
  rate: number
  piecesPerCarton: number
}

export interface UpdateProductDTO {
  name?: string
  rate?: number
  piecesPerCarton?: number
}

export interface ProductImportResult {
  file: string
  created: number
  skippedDuplicate: number
  skippedInvalid: number
  products: Product[]
}