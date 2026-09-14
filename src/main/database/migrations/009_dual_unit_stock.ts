import type { AppDatabase } from '../sqlite'

// Renames `boxesPerCarton` → `piecesPerCarton` on products and invoice_items
// (SQLite 3.25+ supports RENAME COLUMN, no table rebuild needed), and adds
// `newCartons` / `newLoosePieces` columns to `stock_movements` so the running
// balance is stored as a canonical carton + loose-pieces composition alongside
// the existing `newQuantity` (total pieces). Existing rows are backfilled from
// their `newQuantity` and each product's `piecesPerCarton`.

export function up(db: AppDatabase): void {
  db.exec(`
    ALTER TABLE products RENAME COLUMN boxesPerCarton TO piecesPerCarton;
    ALTER TABLE invoice_items RENAME COLUMN boxesPerCarton TO piecesPerCarton;

    ALTER TABLE stock_movements ADD COLUMN newCartons INTEGER;
    ALTER TABLE stock_movements ADD COLUMN newLoosePieces INTEGER;

    UPDATE stock_movements AS m
       SET newCartons = CASE
             WHEN p.piecesPerCarton > 0 THEN CAST(m.newQuantity / p.piecesPerCarton AS INTEGER)
             ELSE 0
           END,
           newLoosePieces = CASE
             WHEN p.piecesPerCarton > 0 THEN m.newQuantity - CAST(m.newQuantity / p.piecesPerCarton AS INTEGER) * p.piecesPerCarton
             ELSE COALESCE(m.newQuantity, 0)
           END
      FROM products p
     WHERE m.productId = p.id
       AND m.newQuantity IS NOT NULL;
  `)
}
