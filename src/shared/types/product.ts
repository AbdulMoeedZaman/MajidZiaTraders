/**
 * A product's three conceptual prices, used to pick the starting rate for an
 * invoice line:
 *
 *  - `preferencePrice`: per-customer agreed price, fetched from the customer
 *    product preferences table (NULL when no per-customer price is set).
 *  - `salePrice`: the product's intended selling price (`products.salesPrice`).
 *  - `minimumPrice`: the lowest price the line may be set to
 *    (`products.rate`); a line can never be manually overridden below it.
 */
export interface ProductPriceBreakdown {
  /** Optional per-customer agreed rate, in integer minor units. */
  preferencePrice: number | null
  /** Optional intended selling rate, in integer minor units. */
  salePrice: number | null
  /** Minimum allowable rate (floor), in integer minor units. */
  minimumPrice: number
}

/**
 * The rate a fresh invoice line should start with, resolved by the fallback
 * chain: preference price -> sales price -> minimum rate. The user can always
 * override it on the invoice, but never below the minimum.
 */
export function fallbackInvoiceRate(prices: ProductPriceBreakdown): number {
  return prices.preferencePrice ?? prices.salePrice ?? prices.minimumPrice
}

export interface Product {
  id: number
  name: string
  /** Minimum allowable rate per carton (`minimumPrice`), in integer minor units (paisa / cents). */
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
 * The rate a fresh invoice line should start with when there is no customer
 * preference in play: the product's Sales Price when one is set, otherwise
 * its minimum rate. Prefer `fallbackInvoiceRate` when a customer preference
 * might apply.
 */
export function defaultInvoiceRate(product: Pick<Product, 'rate' | 'salesPrice'>): number {
  return fallbackInvoiceRate({ preferencePrice: null, salePrice: product.salesPrice, minimumPrice: product.rate })
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