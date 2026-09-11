import type { AppDatabase } from '../sqlite'

export function up(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      description TEXT,
      categoryId INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('in', 'out', 'adjustment')),
      quantity INTEGER NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(productId);
  `)
}
