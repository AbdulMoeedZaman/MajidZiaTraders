import { ProductPreferenceRepository } from '../repositories/product-preference.repository'
import { CustomerRepository } from '../repositories/customer.repository'
import { ProductRepository } from '../repositories/product.repository'
import type {
  CustomerProductPreference,
  PreferencePriceMap,
  SetPreferenceDTO,
} from '@shared/types/product-preference'

const PREFERENCE_PRICE_LABEL = 'Preference price'

export class ProductPreferenceService {
  private prefRepo = new ProductPreferenceRepository()
  private customerRepo = new CustomerRepository()
  private productRepo = new ProductRepository()

  listForCustomer(customerId: number): CustomerProductPreference[] {
    this.assertCustomer(customerId)
    return this.prefRepo.findByCustomer(customerId)
  }

  /** Preference price per product for a customer; see PreferencePriceMap. */
  priceMapForCustomer(customerId: number): PreferencePriceMap {
    this.assertCustomer(customerId)
    return this.prefRepo.priceMapForCustomer(customerId)
  }

  /**
   * Sets (or clears) the per-customer agreement for a product. A preference
   * price can never be below the product's minimum rate.
   */
  set(data: SetPreferenceDTO): CustomerProductPreference {
    this.assertCustomer(data.customerId)
    const product = this.productRepo.findById(data.productId)
    if (!product) {
      throw new Error('Product not found')
    }
    const preferencePrice = data.preferencePrice ?? null
    if (preferencePrice !== null) {
      if (!Number.isInteger(preferencePrice) || preferencePrice < 0) {
        throw new Error(`${PREFERENCE_PRICE_LABEL} must be a whole number of cents and cannot be negative`)
      }
      if (preferencePrice < product.rate) {
        throw new Error(`${PREFERENCE_PRICE_LABEL} cannot be below the product's minimum rate`)
      }
    }
    return this.prefRepo.upsert(data.customerId, data.productId, preferencePrice)
  }

  remove(customerId: number, productId: number): void {
    this.assertCustomer(customerId)
    this.prefRepo.remove(customerId, productId)
  }

  /**
   * Records purchases (called by InvoiceService inside its own transaction).
   * The first purchase of a product by a customer creates the preference entry
   * with the invoiced rate as its price; later purchases never overwrite a
   * price that was set afterwards.
   */
  recordPurchases(customerId: number, purchases: { productId: number; rate: number }[]): void {
    for (const purchase of purchases) {
      this.prefRepo.recordPurchase(customerId, purchase.productId, purchase.rate)
    }
  }

  private assertCustomer(customerId: number): void {
    if (!Number.isInteger(customerId) || !this.customerRepo.findById(customerId)) {
      throw new Error('Customer not found')
    }
  }
}