export interface CustomerProductPreference {
  id: number
  customerId: number
  productId: number
  /** Per-customer agreed rate, integer minor units; null when only the list membership is known. */
  preferencePrice: number | null
  /** Denormalized product name so lists can render without a separate lookup. */
  productName: string
  createdAt: string
  updatedAt: string
}

export interface SetPreferenceDTO {
  customerId: number
  productId: number
  /** Pass null to clear a previously agreed price while keeping it preferred. */
  preferencePrice?: number | null
}

/** productId -> preferencePrice (null when the customer buys it but no price is agreed). */
export type PreferencePriceMap = Map<number, number | null>