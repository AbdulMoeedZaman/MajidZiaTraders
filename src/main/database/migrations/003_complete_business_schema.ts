import type { AppDatabase } from '../sqlite'

export function up(db: AppDatabase): void {
  db.exec('PRAGMA foreign_keys = OFF')

  db.exec(`
    DROP TABLE IF EXISTS stock_adjustments;
    DROP TABLE IF EXISTS restock_items;
    DROP TABLE IF EXISTS restocks;
    DROP TABLE IF EXISTS invoice_items;
    DROP TABLE IF EXISTS invoices;
    DROP TABLE IF EXISTS customer_payments;
    DROP TABLE IF EXISTS customer_ledger;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS inventory_movements;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS business_profile;
  `)

  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS business_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      ownerName TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      country TEXT,
      taxId TEXT,
      taxRate INTEGER NOT NULL DEFAULT 0,
      logoPath TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      invoiceFooter TEXT,
      invoicePrefix TEXT NOT NULL DEFAULT 'INV-',
      invoiceNextNumber INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'string',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      categoryId INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      unit TEXT NOT NULL DEFAULT 'piece',
      piecesPerCarton INTEGER NOT NULL DEFAULT 1,
      baseCostPrice INTEGER NOT NULL DEFAULT 0,
      minSellingPrice INTEGER NOT NULL DEFAULT 0,
      sellingPrice INTEGER NOT NULL DEFAULT 0,
      reorderLevel INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('opening_stock', 'restock', 'sale', 'adjustment', 'damage', 'return', 'other')),
      quantity INTEGER NOT NULL,
      previousQuantity INTEGER NOT NULL,
      newQuantity INTEGER NOT NULL,
      referenceType TEXT,
      referenceId INTEGER,
      reason TEXT,
      cost INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      stockMovementId INTEGER REFERENCES stock_movements(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('damage', 'theft', 'loss', 'correction', 'return')),
      quantityAdjustment INTEGER NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('invoice', 'payment', 'credit_note', 'adjustment')),
      referenceType TEXT,
      referenceId INTEGER,
      debit INTEGER NOT NULL DEFAULT 0,
      credit INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      transactionDate TEXT NOT NULL DEFAULT (date('now')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      invoiceId INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('cash', 'bank_transfer', 'card', 'check', 'other')),
      reference TEXT,
      notes TEXT,
      paymentDate TEXT NOT NULL DEFAULT (date('now')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT NOT NULL UNIQUE,
      customerId INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      dueDate TEXT,
      subtotal INTEGER NOT NULL DEFAULT 0,
      discount INTEGER NOT NULL DEFAULT 0,
      taxRate INTEGER NOT NULL DEFAULT 0,
      taxAmount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      totalCost INTEGER NOT NULL DEFAULT 0,
      totalProfit INTEGER NOT NULL DEFAULT 0,
      paid INTEGER NOT NULL DEFAULT 0,
      outstanding INTEGER NOT NULL DEFAULT 0,
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
      unit TEXT NOT NULL DEFAULT 'piece',
      quantity INTEGER NOT NULL,
      costPriceAtSale INTEGER NOT NULL DEFAULT 0,
      minSellingPriceAtSale INTEGER NOT NULL DEFAULT 0,
      actualSellingPrice INTEGER NOT NULL DEFAULT 0,
      lineSubtotal INTEGER NOT NULL DEFAULT 0,
      lineCost INTEGER NOT NULL DEFAULT 0,
      lineProfit INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS restocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referenceNumber TEXT NOT NULL UNIQUE,
      supplierName TEXT NOT NULL,
      date TEXT NOT NULL,
      totalCost INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'received', 'cancelled')),
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS restock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restockId INTEGER NOT NULL REFERENCES restocks(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      unit TEXT NOT NULL DEFAULT 'piece',
      quantity INTEGER NOT NULL,
      unitCost INTEGER NOT NULL DEFAULT 0,
      totalCost INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(isActive);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(productId);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(type);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(createdAt);
    CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON stock_adjustments(productId);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(isActive);
    CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger(customerId);
    CREATE INDEX IF NOT EXISTS idx_customer_ledger_date ON customer_ledger(transactionDate);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON customer_payments(customerId);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON customer_payments(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON customer_payments(paymentDate);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customerId);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
    CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoiceNumber);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(productId);
    CREATE INDEX IF NOT EXISTS idx_restocks_status ON restocks(status);
    CREATE INDEX IF NOT EXISTS idx_restocks_date ON restocks(date);
    CREATE INDEX IF NOT EXISTS idx_restock_items_restock ON restock_items(restockId);
    CREATE INDEX IF NOT EXISTS idx_restock_items_product ON restock_items(productId);
  `)
}
