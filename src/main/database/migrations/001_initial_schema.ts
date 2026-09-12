import type { AppDatabase } from '../sqlite'

// Initial schema for the parts-sales invoicing app.
//
//  Core domain:
//  - project_owners  : one or more owner profiles (name, phone, address)
//  - brokers         : broker / booker entries (name, phone)
//  - routes          : six fixed delivery routes, one per delivery day
//                      (Monday, Tuesday, Wednesday, Thursday, Saturday, Sunday) — Friday is not a route
//  - products        : name, rate (the minimum allowable rate per carton, integer minor units),
//                      boxesPerCarton ("number")
//  - customers       : code (unique), shop name, owner name, phone, address, assigned route
//  - invoices        : customer, project owner, broker, filer status, computed subtotal,
//                      manual remaining / tax / grand total fields
//  - invoice_items   : product line, rate (>= product floor), carton count, box count, computed amount
//
//  Settings store the invoice number counter and the rich-text invoice description
//  that is pulled into every printed invoice.

export function up(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS brokers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      position INTEGER NOT NULL UNIQUE,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO routes (name, position) VALUES
      ('Monday', 1),
      ('Tuesday', 2),
      ('Wednesday', 3),
      ('Thursday', 4),
      ('Saturday', 5),
      ('Sunday', 6);

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      rate INTEGER NOT NULL DEFAULT 0,
      boxesPerCarton INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      shopName TEXT NOT NULL DEFAULT '',
      ownerName TEXT NOT NULL DEFAULT '',
      phone TEXT,
      address TEXT,
      routeId INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
      ownerId INTEGER REFERENCES project_owners(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT NOT NULL UNIQUE,
      customerId INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      ownerId INTEGER NOT NULL REFERENCES project_owners(id) ON DELETE RESTRICT,
      brokerId INTEGER NOT NULL REFERENCES brokers(id) ON DELETE RESTRICT,
      date TEXT NOT NULL,
      filerStatus TEXT NOT NULL DEFAULT 'non_filer' CHECK (filerStatus IN ('filer', 'non_filer')),
      subtotal INTEGER NOT NULL DEFAULT 0,
      remaining INTEGER,
      tax INTEGER,
      grandTotal INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      productName TEXT NOT NULL,
      rate INTEGER NOT NULL,
      minRate INTEGER NOT NULL,
      boxesPerCarton INTEGER NOT NULL,
      cartonCount INTEGER NOT NULL,
      boxCount INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_customers_route ON customers(routeId);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(productId);

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT,
      type TEXT NOT NULL DEFAULT 'string',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO settings (key, value, type) VALUES ('invoice_next_number', '1', 'number');
    INSERT OR IGNORE INTO settings (key, value, type) VALUES ('invoice_description', '', 'richtext');
  `)
}