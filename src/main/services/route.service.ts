import { RouteRepository } from '../repositories/route.repository'
import type { Route, RouteWithCount } from '@shared/types/route'

/** Routes are six fixed delivery days; only their display names are editable. */
export class RouteService {
  private routeRepo = new RouteRepository()

  list(): Route[] {
    return this.routeRepo.findAll()
  }

  listWithCounts(): RouteWithCount[] {
    return this.routeRepo.findAllWithCounts()
  }

  rename(id: number, name: string): Route {
    const existing = this.routeRepo.findById(id)
    if (!existing) {
      throw new Error('Route not found')
    }
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('Route name cannot be empty')
    }
    const conflict = this.routeRepo.findByNameExcludingId(trimmed, id)
    if (conflict) {
      throw new Error('Another route already uses this name')
    }
    return this.routeRepo.update(id, trimmed)
  }
}