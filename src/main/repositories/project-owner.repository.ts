import { BaseRepository } from './base.repository'
import type {
  ProjectOwner,
  CreateProjectOwnerDTO,
  UpdateProjectOwnerDTO,
} from '@shared/types/project-owner'

export class ProjectOwnerRepository extends BaseRepository {
  findAll(): ProjectOwner[] {
    return this.db.prepare('SELECT * FROM project_owners ORDER BY name').all() as ProjectOwner[]
  }

  findById(id: number): ProjectOwner | null {
    return this.db.prepare('SELECT * FROM project_owners WHERE id = ?').get(id) as ProjectOwner | null
  }

  findByName(name: string): ProjectOwner | null {
    return this.db.prepare('SELECT * FROM project_owners WHERE name = ?').get(name) as ProjectOwner | null
  }

  findByNameExcludingId(name: string, excludeId: number): ProjectOwner | null {
    return this.db
      .prepare('SELECT * FROM project_owners WHERE name = ? AND id != ?')
      .get(name, excludeId) as ProjectOwner | null
  }

  create(data: CreateProjectOwnerDTO): ProjectOwner {
    const result = this.db
      .prepare('INSERT INTO project_owners (name, phone, address) VALUES (?, ?, ?)')
      .run(data.name.trim(), data.phone?.trim() || null, data.address?.trim() || null)
    return this.findById(result.lastInsertRowid as number)!
  }

  update(id: number, data: UpdateProjectOwnerDTO): ProjectOwner {
    const fields: string[] = []
    const values: unknown[] = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()) }
    if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone?.trim() || null) }
    if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address?.trim() || null) }
    if (fields.length === 0) return this.findById(id)!
    fields.push("updatedAt = datetime('now')")
    values.push(id)
    this.db.prepare(`UPDATE project_owners SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM project_owners WHERE id = ?').run(id)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM project_owners').get() as { count: number }).count
  }
}