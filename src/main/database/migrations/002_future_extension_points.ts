import type { AppDatabase } from '../sqlite'

// Future-feature extension points — tables for features that are intentionally NOT
// built in this phase, but whose schema is created now so they can be added without
// rework:
//
//  - payments        : invoice payment tracking with system-calculated remaining
//                      balances. A payment row references the invoice it settles
//                      (customerId is denormalised so "all payments for a customer"
//                      is one query). The invoice's remaining/grandTotal fields can
//                      later be derived from this table.
//  - stock_movements : a stock ledger referencing products. Every gain/loss of stock
//                      is an append-only row (type, signed quantity, previous/new
//                      balance, optional link to the causing invoice). Current stock
//                      of a product is simply the latest movement's newQuantity.
//                      Supports daily stock reports, load forms and inventory
//                      tracking built on top of this ledger.

export function up(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER REFERENCES invoices(id) ON DELETE RESTRICT,
      customerId INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
      amount INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('opening', 'sale', 'purchase', 'adjustment', 'damage', 'return', 'other')),
      quantity INTEGER NOT NULL,
      previousQuantity INTEGER,
      newQuantity INTEGER,
      referenceType TEXT,
      referenceId INTEGER,
      note TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customerId);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(productId);
  `)
}