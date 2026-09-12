import { BaseRepository } from './base.repository'
import type { Product, CreateProductDTO, UpdateProductDTO } from '@shared/types/product'

export class ProductRepository extends BaseRepository {
  findAll(): Product[] {
    return this.db.prepare('SELECT * FROM products ORDER BY name').all() as Product[]
  }

  findById(id: number): Product | null {
    return this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | null
  }

  findBySku(sku: string): Product | null {
    return this.db.prepare('SELECT * FROM products WHERE sku = ?').get(sku) as Product | null
  }

  findBySkuExcludingId(sku: string, excludeId: number): Product | null {
    return this.db.prepare('SELECT * FROM products WHERE sku = ? AND id != ?').get(sku, excludeId) as Product | null
  }

  search(query: string): Product[] {
    return this.db
      .prepare('SELECT * FROM products WHERE (name LIKE ? OR sku LIKE ?) ORDER BY name')
      .all(`%${query}%`, `%${query}%`) as Product[]
  }

  create(data: CreateProductDTO): Product {
    const result = this.db
      .prepare(
        `INSERT INTO products (sku, name, piecesPerCarton, minSellingPrice, sellingPrice)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        data.sku,
        data.name,
        data.piecesPerCarton ?? 1,
        data.minSellingPrice ?? 0,
        data.sellingPrice ?? 0
      )

    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, data: UpdateProductDTO): Product {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.sku !== undefined) { fields.push('sku = ?'); values.push(data.sku) }
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.piecesPerCarton !== undefined) { fields.push('piecesPerCarton = ?'); values.push(data.piecesPerCarton) }
    if (data.minSellingPrice !== undefined) { fields.push('minSellingPrice = ?'); values.push(data.minSellingPrice) }
    if (data.sellingPrice !== undefined) { fields.push('sellingPrice = ?'); values.push(data.sellingPrice) }

    if (fields.length === 0) return this.findById(id)!

    fields.push("updatedAt = datetime('now')")
    values.push(id)

    this.db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM products WHERE id = ?').run(id)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }).count
  }
}