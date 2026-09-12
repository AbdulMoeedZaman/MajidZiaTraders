export interface Route {
  id: number
  name: string
  position: number
  isActive: number
  createdAt: string
}

/** Route with the count of customers assigned to it (for tab badges). */
export interface RouteWithCount extends Route {
  customerCount: number
}