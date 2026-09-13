import { BaseRepository } from './base.repository'
import type { Product, CreateProductDTO, UpdateProductDTO } from '@shared/types/product'

export class ProductRepository extends BaseRepository {
  findAll(): Product[] {
    return this.db.prepare('SELECT * FROM products ORDER BY name').all() as Product[]
  }

  findById(id: number): Product | null {
    return this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | null
  }

  findByName(name: string): Product | null {
    return this.db.prepare('SELECT * FROM products WHERE name = ?').get(name) as Product | null
  }

  findByNameExcludingId(name: string, excludeId: number): Product | null {
    return this.db.prepare('SELECT * FROM products WHERE name = ? AND id != ?').get(name, excludeId) as Product | null
  }

  search(query: string): Product[] {
    return this.db
      .prepare('SELECT * FROM products WHERE name LIKE ? ORDER BY name')
      .all(`%${query}%`) as Product[]
  }

  create(data: CreateProductDTO): Product {
    const result = this.db
      .prepare('INSERT INTO products (name, rate, boxesPerCarton) VALUES (?, ?, ?)')
      .run(data.name.trim(), data.rate, data.boxesPerCarton)
    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, data: UpdateProductDTO): Product {
    const fields: string[] = []
    const values: unknown[] = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()) }
    if (data.rate !== undefined) { fields.push('rate = ?'); values.push(data.rate) }
    if (data.boxesPerCarton !== undefined) { fields.push('boxesPerCarton = ?'); values.push(data.boxesPerCarton) }
    if (fields.length === 0) return this.findById(id)!
    fields.push("updatedAt = datetime('now')")
    values.push(id)
    this.db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM products WHERE id = ?').run(id)
  }

  /** Re-inserts a product with its original id (redo of product_created). */
  restore(product: Product): void {
    this.db
      .prepare(
        `INSERT INTO products (id, name, rate, boxesPerCarton, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(product.id, product.name, product.rate, product.boxesPerCarton, product.createdAt, product.updatedAt)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }).count
  }

  /** Invoice lines that reference this product (blocks deletion). */
  countInvoiceReferences(productId: number): number {
    const result = this.db
      .prepare('SELECT COUNT(*) AS count FROM invoice_items WHERE productId = ?')
      .get(productId) as { count: number }
    return result.count
  }
}