import type { AppDatabase } from '../sqlite'

// Product & restock (purchase) structure redesign.
//
//  1. products gain the pack/purchase structure used by the restock side:
//     packSize ("33g" display only), packConfig ("6x24" display only), mrp (printed
//     retail price per piece, nullable), purchaseUnit (default 'carton').
//     piecesPerCarton (already present) becomes the live conversion factor
//     purchaseUnit -> unit (1 carton = piecesPerCarton pieces).
//
//  2. restocks gain the supplier sales-tax invoice header references and the
//     aggregate totals that mirror how invoices store subtotal/tax/total.
//     totalCost keeps its name but its meaning becomes the grand total payable.
//
//  3. restock_items is rebuilt with the full per-line tax/discount structure.
//     Old rows are a best-effort backfill (qtyCartons = quantity, piecesPerCarton = 1,
//     netSalesValueExcl = totalCost, discountedValueInclusive = totalCost), since the
//     old schema never captured tax or carton sizes.
//
//  4. Business-wide defaults for the restock tax rates are seeded as settings
//     (purchaseSalesTaxRateBps = 1800 i.e. 18.00%, purchaseAdvanceTaxRateBps = 10
//     i.e. 0.10%), read by the restock form/service when a line does not override them.

function columnNames(db: AppDatabase, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
}

export function up(db: AppDatabase): void {
  // 1. Products: pack/purchase structure.
  const productColumns = columnNames(db, 'products')
  if (!productColumns.includes('packSize')) {
    db.exec('ALTER TABLE products ADD COLUMN packSize TEXT')
  }
  if (!productColumns.includes('packConfig')) {
    db.exec('ALTER TABLE products ADD COLUMN packConfig TEXT')
  }
  if (!productColumns.includes('mrp')) {
    db.exec('ALTER TABLE products ADD COLUMN mrp INTEGER')
  }
  if (!productColumns.includes('purchaseUnit')) {
    db.exec("ALTER TABLE products ADD COLUMN purchaseUnit TEXT NOT NULL DEFAULT 'carton'")
  }

  // 2. Restock header: supplier-invoice references + aggregate totals.
  const restockColumns = columnNames(db, 'restocks')
  const restockAdditions: Array<{ column: string; definition: string }> = [
    { column: 'supplierInvoiceNo', definition: 'supplierInvoiceNo TEXT' },
    { column: 'supplierRegistrationNo', definition: 'supplierRegistrationNo TEXT' },
    { column: 'buyerNtn', definition: 'buyerNtn TEXT' },
    { column: 'buyerCnic', definition: 'buyerCnic TEXT' },
    { column: 'dispatchNoteNo', definition: 'dispatchNoteNo TEXT' },
    { column: 'salesOrderNo', definition: 'salesOrderNo TEXT' },
    { column: 'totalRetailValueExcl', definition: 'totalRetailValueExcl INTEGER NOT NULL DEFAULT 0' },
    { column: 'totalSalesTax', definition: 'totalSalesTax INTEGER NOT NULL DEFAULT 0' },
    { column: 'totalAdvanceTax', definition: 'totalAdvanceTax INTEGER NOT NULL DEFAULT 0' },
    { column: 'totalTradeDiscount', definition: 'totalTradeDiscount INTEGER NOT NULL DEFAULT 0' },
    { column: 'totalNetValueExcl', definition: 'totalNetValueExcl INTEGER NOT NULL DEFAULT 0' },
  ]
  for (const { column, definition } of restockAdditions) {
    if (!restockColumns.includes(column)) {
      db.exec(`ALTER TABLE restocks ADD COLUMN ${definition}`)
    }
  }
  // Old rows never captured tax: their totalCost was the flat line-cost sum, so it is
  // also the best available net value, and grand-total-payable stays unchanged.
  db.exec('UPDATE restocks SET totalNetValueExcl = totalCost WHERE totalNetValueExcl = 0 AND totalCost != 0')

  // 3. Restock items: rebuild with the full tax/discount structure.
  const itemColumns = columnNames(db, 'restock_items')
  if (!itemColumns.includes('qtyCartons')) {
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec(`
      CREATE TABLE restock_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restockId INTEGER NOT NULL REFERENCES restocks(id) ON DELETE CASCADE,
        productId INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        qtyCartons INTEGER NOT NULL,
        piecesPerCarton INTEGER NOT NULL,
        mrpPerPiece INTEGER,
        salesTaxRate INTEGER NOT NULL DEFAULT 1800,
        retailPricePerCarton INTEGER NOT NULL DEFAULT 0,
        totalRetailValueExcl INTEGER NOT NULL DEFAULT 0,
        salesTaxAmount INTEGER NOT NULL DEFAULT 0,
        advanceTaxRate INTEGER NOT NULL DEFAULT 10,
        advanceTax INTEGER NOT NULL DEFAULT 0,
        netSalesValueExcl INTEGER NOT NULL DEFAULT 0,
        tradeDiscountValue INTEGER NOT NULL DEFAULT 0,
        discountedValueInclusive INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO restock_items_new
        (id, restockId, productId, qtyCartons, piecesPerCarton, mrpPerPiece, salesTaxRate, retailPricePerCarton, totalRetailValueExcl, salesTaxAmount, advanceTaxRate, advanceTax, netSalesValueExcl, tradeDiscountValue, discountedValueInclusive, createdAt)
        SELECT id, restockId, productId, quantity, 1, NULL, 1800, 0, 0, 0, 10, 0, totalCost, 0, totalCost, createdAt
        FROM restock_items;
      DROP TABLE restock_items;
      ALTER TABLE restock_items_new RENAME TO restock_items;

      CREATE INDEX IF NOT EXISTS idx_restock_items_restock ON restock_items(restockId);
      CREATE INDEX IF NOT EXISTS idx_restock_items_product ON restock_items(productId);
    `)
    db.exec('PRAGMA foreign_keys = ON')
  }

  // 4. Business-wide restock tax defaults.
  db.exec(`
    INSERT OR IGNORE INTO settings (key, value, type) VALUES ('purchaseSalesTaxRateBps', '1800', 'number');
    INSERT OR IGNORE INTO settings (key, value, type) VALUES ('purchaseAdvanceTaxRateBps', '10', 'number');
  `)
}