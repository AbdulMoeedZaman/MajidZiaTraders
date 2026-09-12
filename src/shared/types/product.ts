export interface Product {
  id: number
  name: string
  /** Minimum allowable rate per carton, in integer minor units (paisa / cents). */
  rate: number
  /** Number of boxes per carton. */
  boxesPerCarton: number
  createdAt: string
  updatedAt: string
}

export interface CreateProductDTO {
  name: string
  rate: number
  boxesPerCarton: number
}

export interface UpdateProductDTO {
  name?: string
  rate?: number
  boxesPerCarton?: number
}