export interface Product {
  id: number
  name: string
  /** Minimum allowable rate per carton, in integer minor units (paisa / cents). */
  rate: number
  /**
   * Optional intended selling price per carton, in integer minor units
   * (paisa / cents). When set, a new invoice line autofills with it; when
   * blank (null) the line falls back to the minimum rate.
   */
  salesPrice: number | null
  /** Number of boxes per carton. */
  piecesPerCarton: number
  createdAt: string
  updatedAt: string
}

/**
 * The rate a fresh invoice line should start with: the product's Sales Price
 * when one is set, otherwise its minimum rate. The user can always override
 * it on the invoice.
 */
export function defaultInvoiceRate(product: Pick<Product, 'rate' | 'salesPrice'>): number {
  return product.salesPrice ?? product.rate
}

export interface CreateProductDTO {
  name: string
  rate: number
  /** Optional intended selling price (minor units). Omit or null to leave unset. */
  salesPrice?: number | null
  piecesPerCarton: number
}

export interface UpdateProductDTO {
  name?: string
  rate?: number
  /** Pass null to clear a previously set sales price. */
  salesPrice?: number | null
  piecesPerCarton?: number
}

export interface ProductImportResult {
  file: string
  created: number
  skippedDuplicate: number
  skippedInvalid: number
  products: Product[]
}