import { BaseRepository } from './base.repository'
import type { Route, RouteWithCount } from '@shared/types/route'

export class RouteRepository extends BaseRepository {
  findAll(): Route[] {
    return this.db.prepare('SELECT * FROM routes WHERE isActive = 1 ORDER BY position').all() as Route[]
  }

  findAllWithCounts(): RouteWithCount[] {
    return this.db
      .prepare(
        `SELECT r.*, COUNT(c.id) AS customerCount
         FROM routes r
         LEFT JOIN customers c ON c.routeId = r.id
         WHERE r.isActive = 1
         GROUP BY r.id
         ORDER BY r.position`
      )
      .all() as RouteWithCount[]
  }

  findById(id: number): Route | null {
    return this.db.prepare('SELECT * FROM routes WHERE id = ?').get(id) as Route | null
  }

  findByName(name: string): Route | null {
    return this.db.prepare('SELECT * FROM routes WHERE name = ?').get(name) as Route | null
  }
}