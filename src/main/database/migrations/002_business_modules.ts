import type { AppDatabase } from '../sqlite'

export function up(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      taxId TEXT,
      creditLimit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('invoice', 'payment', 'credit_note', 'adjustment')),
      referenceId INTEGER,
      referenceType TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      description TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      invoiceId INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('cash', 'bank_transfer', 'card', 'check', 'other')),
      reference TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT NOT NULL UNIQUE,
      customerId INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      dueDate TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      taxRate REAL NOT NULL DEFAULT 0,
      taxAmount REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      paid REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled')),
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      productName TEXT NOT NULL,
      productSku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unitPrice REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS restocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referenceNumber TEXT NOT NULL UNIQUE,
      supplierName TEXT NOT NULL,
      date TEXT NOT NULL,
      totalCost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'received', 'cancelled')),
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS restock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restockId INTEGER NOT NULL REFERENCES restocks(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      productName TEXT NOT NULL,
      productSku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unitCost REAL NOT NULL,
      total REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS business_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      legalName TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      postalCode TEXT,
      country TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      taxId TEXT,
      taxRate REAL NOT NULL DEFAULT 0,
      logoPath TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      invoicePrefix TEXT NOT NULL DEFAULT 'INV-',
      invoiceNextNumber INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('damage', 'theft', 'loss', 'correction', 'return')),
      quantityBefore INTEGER NOT NULL,
      quantityAdjustment INTEGER NOT NULL,
      quantityAfter INTEGER NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger(customerId);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON customer_payments(customerId);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON customer_payments(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customerId);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(productId);
    CREATE INDEX IF NOT EXISTS idx_restocks_status ON restocks(status);
    CREATE INDEX IF NOT EXISTS idx_restock_items_restock ON restock_items(restockId);
    CREATE INDEX IF NOT EXISTS idx_restock_items_product ON restock_items(productId);
    CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
    CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
    CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON stock_adjustments(productId);
  `)
}
