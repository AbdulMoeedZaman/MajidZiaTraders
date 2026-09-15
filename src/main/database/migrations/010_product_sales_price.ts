import type { AppDatabase } from '../sqlite'

// Adds an optional `salesPrice` to products: the intended selling price per
// carton, in integer minor units (paisa / cents). NULL means unset. When a
// product with a sales price is added to an invoice, the line's rate field
// autofills with it; products without one fall back to their minimum rate
// (`rate`). The column is nullable so existing products keep working with no
// migration value.

export function up(db: AppDatabase): void {
  db.exec(`
    ALTER TABLE products ADD COLUMN salesPrice INTEGER;
  `)
}