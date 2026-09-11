import { BaseRepository } from './base.repository'
import type { Product, CreateProductDTO, UpdateProductDTO } from '@shared/types/product'

export class ProductRepository extends BaseRepository {
  findAll(): Product[] {
    return this.db.prepare('SELECT * FROM products ORDER BY name').all() as Product[]
  }

  findActive(): Product[] {
    return this.db.prepare('SELECT * FROM products WHERE isActive = 1 ORDER BY name').all() as Product[]
  }

  findInactive(): Product[] {
    return this.db.prepare('SELECT * FROM products WHERE isActive = 0 ORDER BY name').all() as Product[]
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

  findByCategoryId(categoryId: number): Product[] {
    return this.db.prepare('SELECT * FROM products WHERE categoryId = ? AND isActive = 1 ORDER BY name').all(categoryId) as Product[]
  }

  findByCategoryIdAll(categoryId: number): Product[] {
    return this.db.prepare('SELECT * FROM products WHERE categoryId = ? ORDER BY name').all(categoryId) as Product[]
  }

  search(query: string): Product[] {
    return this.db
      .prepare('SELECT * FROM products WHERE (name LIKE ? OR sku LIKE ? OR description LIKE ?) AND isActive = 1 ORDER BY name')
      .all(`%${query}%`, `%${query}%`, `%${query}%`) as Product[]
  }

  create(data: CreateProductDTO): Product {
    const result = this.db
      .prepare(
        `INSERT INTO products (sku, name, description, categoryId, unit, piecesPerCarton, packSize, packConfig, mrp, purchaseUnit, baseCostPrice, minSellingPrice, sellingPrice, reorderLevel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.sku,
        data.name,
        data.description ?? null,
        data.categoryId ?? null,
        data.unit ?? 'piece',
        data.piecesPerCarton ?? 1,
        data.packSize ?? null,
        data.packConfig ?? null,
        data.mrp ?? null,
        data.purchaseUnit ?? 'carton',
        data.baseCostPrice ?? 0,
        data.minSellingPrice ?? 0,
        data.sellingPrice ?? 0,
        data.reorderLevel ?? 0
      )

    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, data: UpdateProductDTO): Product {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.sku !== undefined) { fields.push('sku = ?'); values.push(data.sku) }
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.categoryId !== undefined) { fields.push('categoryId = ?'); values.push(data.categoryId) }
    if (data.unit !== undefined) { fields.push('unit = ?'); values.push(data.unit) }
    if (data.piecesPerCarton !== undefined) { fields.push('piecesPerCarton = ?'); values.push(data.piecesPerCarton) }
    if (data.packSize !== undefined) { fields.push('packSize = ?'); values.push(data.packSize) }
    if (data.packConfig !== undefined) { fields.push('packConfig = ?'); values.push(data.packConfig) }
    if (data.mrp !== undefined) { fields.push('mrp = ?'); values.push(data.mrp) }
    if (data.purchaseUnit !== undefined) { fields.push('purchaseUnit = ?'); values.push(data.purchaseUnit) }
    if (data.baseCostPrice !== undefined) { fields.push('baseCostPrice = ?'); values.push(data.baseCostPrice) }
    if (data.minSellingPrice !== undefined) { fields.push('minSellingPrice = ?'); values.push(data.minSellingPrice) }
    if (data.sellingPrice !== undefined) { fields.push('sellingPrice = ?'); values.push(data.sellingPrice) }
    if (data.reorderLevel !== undefined) { fields.push('reorderLevel = ?'); values.push(data.reorderLevel) }
    if (data.isActive !== undefined) { fields.push('isActive = ?'); values.push(data.isActive) }

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

  countActive(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM products WHERE isActive = 1').get() as { count: number }).count
  }
}
