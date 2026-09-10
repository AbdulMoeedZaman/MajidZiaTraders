import { BaseRepository } from './base.repository'
import type { Category, CreateCategoryDTO, UpdateCategoryDTO } from '@shared/types/category'

export class CategoryRepository extends BaseRepository {
  findAll(): Category[] {
    return this.db.prepare('SELECT * FROM categories ORDER BY name').all() as Category[]
  }

  findActive(): Category[] {
    return this.db.prepare('SELECT * FROM categories WHERE isActive = 1 ORDER BY name').all() as Category[]
  }

  findById(id: number): Category | null {
    return this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category | null
  }

  findByName(name: string): Category | null {
    return this.db.prepare('SELECT * FROM categories WHERE name = ?').get(name) as Category | null
  }

  create(data: CreateCategoryDTO): Category {
    const result = this.db
      .prepare('INSERT INTO categories (name, description) VALUES (?, ?)')
      .run(data.name, data.description ?? null)

    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, data: UpdateCategoryDTO): Category {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.isActive !== undefined) { fields.push('isActive = ?'); values.push(data.isActive) }

    if (fields.length === 0) return this.findById(id)!

    fields.push("updatedAt = datetime('now')")
    values.push(id)
    this.db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }).count
  }
}
