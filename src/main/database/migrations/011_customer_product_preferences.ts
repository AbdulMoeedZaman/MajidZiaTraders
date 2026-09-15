import type { AppDatabase } from '../sqlite'

// Customer product preferences:
//  - Tracks, per customer, a preferred list of products plus an optional
//    per-customer price (`preferencePrice`, integer minor units / paisa). A
//    product is "preferred" for the customer simply by having a row here.
//  - `preferencePrice` is NULL when no per-customer price has been agreed yet;
//    the shared pricing fallback chain is then preference_price -> sales_price
//    -> minimum rate.
//  - The row is created automatically the first time the customer buys the
//    product (price snapshot at invoice time), so the list doubles as
//    "previous buyers". A price set later overrides the snapshot and is never
//    clobbered by subsequent purchases.
//  - Deleting a customer or product removes the corresponding preferences.

export function up(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE customer_product_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL
        REFERENCES customers(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL
        REFERENCES products(id) ON DELETE CASCADE,
      preferencePrice INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (customerId, productId)
    );

    CREATE INDEX idx_customer_product_preferences_customer
      ON customer_product_preferences(customerId);
    CREATE INDEX idx_customer_product_preferences_product
      ON customer_product_preferences(productId);
  `)
}