import { RouteRepository } from '../repositories/route.repository'
import type { Route, RouteWithCount } from '@shared/types/route'

/** Routes are fixed (six delivery days); this service is read-only. */
export class RouteService {
  private routeRepo = new RouteRepository()

  list(): Route[] {
    return this.routeRepo.findAll()
  }

  listWithCounts(): RouteWithCount[] {
    return this.routeRepo.findAllWithCounts()
  }
}