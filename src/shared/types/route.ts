export interface Route {
  id: number
  /** Fixed day-of-week the route represents (immutable seed value). */
  day: string
  /** Editable display name the user assigns to this day's route. */
  name: string
  position: number
  isActive: number
  createdAt: string
}

/** Route with the count of customers assigned to it (for tab badges). */
export interface RouteWithCount extends Route {
  customerCount: number
}