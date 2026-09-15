import { BaseRepository } from './base.repository'
import type { CustomerProductPreference, PreferencePriceMap } from '@shared/types/product-preference'

interface PreferenceRow extends CustomerProductPreference {}

export class ProductPreferenceRepository extends BaseRepository {
  /** All preferences for a customer, joined with product name, ordered by name. */
  findByCustomer(customerId: number): CustomerProductPreference[] {
    return this.db
      .prepare(
        `SELECT pp.id, pp.customerId, pp.productId, pp.preferencePrice,
                pr.name AS productName, pp.createdAt, pp.updatedAt
         FROM customer_product_preferences pp
         JOIN products pr ON pr.id = pp.productId
         WHERE pp.customerId = ?
         ORDER BY pr.name`
      )
      .all(customerId) as PreferenceRow[]
  }

  find(customerId: number, productId: number): CustomerProductPreference | null {
    return this.db
      .prepare(
        `SELECT pp.id, pp.customerId, pp.productId, pp.preferencePrice,
                pr.name AS productName, pp.createdAt, pp.updatedAt
         FROM customer_product_preferences pp
         JOIN products pr ON pr.id = pp.productId
         WHERE pp.customerId = ? AND pp.productId = ?`
      )
      .get(customerId, productId) as PreferenceRow | null
  }

  /** Preference price per product for a customer; product ids with a row but no price map to null. */
  priceMapForCustomer(customerId: number): PreferencePriceMap {
    const rows = this.db
      .prepare('SELECT productId, preferencePrice FROM customer_product_preferences WHERE customerId = ?')
      .all(customerId) as { productId: number; preferencePrice: number | null }[]
    return new Map(rows.map((row) => [row.productId, row.preferencePrice]))
  }

  /**
   * Insert or update a preference. `preferencePrice` may be null to keep the
   * product preferred without an agreed price.
   */
  upsert(customerId: number, productId: number, preferencePrice: number | null): CustomerProductPreference {
    this.db
      .prepare(
        `INSERT INTO customer_product_preferences (customerId, productId, preferencePrice)
         VALUES (?, ?, ?)
         ON CONFLICT (customerId, productId) DO UPDATE SET
           preferencePrice = excluded.preferencePrice,
           updatedAt = datetime('now')`
      )
      .run(customerId, productId, preferencePrice)
    return this.find(customerId, productId)!
  }

  remove(customerId: number, productId: number): void {
    this.db
      .prepare('DELETE FROM customer_product_preferences WHERE customerId = ? AND productId = ?')
      .run(customerId, productId)
  }

  /**
   * Record that a customer purchased a product (first purchase establishes the
   * preference list entry). Never touches an existing row — a preference price
   * set after the first purchase is preserved.
   */
  recordPurchase(customerId: number, productId: number, preferencePrice: number | null): void {
    this.db
      .prepare(
        `INSERT INTO customer_product_preferences (customerId, productId, preferencePrice)
         VALUES (?, ?, ?)
         ON CONFLICT (customerId, productId) DO NOTHING`
      )
      .run(customerId, productId, preferencePrice)
  }
}