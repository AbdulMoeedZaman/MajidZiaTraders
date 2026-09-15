import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../../lib/api'
import { getSelectedRoute, setSelectedRoute } from '../../../lib/selected-route'
import type { RouteWithCount } from '@shared/types/route'
import type { CustomerWithRoute, CreateCustomerDTO, UpdateCustomerDTO } from '@shared/types/customer'

export function useCustomers() {
  const [routes, setRoutes] = useState<RouteWithCount[]>([])
  const [customers, setCustomers] = useState<CustomerWithRoute[]>([])
  const [activeRouteId, setActiveRouteId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const activeRouteIdRef = useRef<number | null>(null)

  const refreshRoutes = useCallback(async () => {
    const r = await api.routes.listWithCounts()
    setRoutes(r)
    if (!r.length) {
      activeRouteIdRef.current = null
      setActiveRouteId(null)
      return r
    }
    // The route the user last had selected survives view changes and remounts,
    // so the route-level shortcuts (Alt+Q / Alt+W) target the same route.
    const remembered = activeRouteIdRef.current ?? getSelectedRoute()
    const stillThere = remembered !== null && r.some((x) => x.id === remembered)
    const next = remembered !== null && stillThere ? remembered : r[0].id
    activeRouteIdRef.current = next
    setSelectedRoute(next)
    setActiveRouteId(next)
    return r
  }, [])

  const loadRoute = useCallback(
    async (routeId: number) => {
      const list = await api.customers.listByRoute(routeId)
      setCustomers(list)
      return list
    },
    []
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void refreshRoutes()
      .then(async (r) => {
        if (cancelled) return
        if (!r.length) return
        await loadRoute(activeRouteIdRef.current!)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load routes')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshRoutes, loadRoute])

  const setRoute = useCallback(
    async (routeId: number) => {
      activeRouteIdRef.current = routeId
      setSelectedRoute(routeId)
      setActiveRouteId(routeId)
      setCustomers([])
      await loadRoute(routeId)
    },
    [loadRoute]
  )

  const reloadActiveRoute = useCallback(async () => {
    const id = activeRouteIdRef.current
    if (id !== null) await loadRoute(id)
    await refreshRoutes()
  }, [loadRoute, refreshRoutes])

  const create = useCallback(
    async (data: CreateCustomerDTO) => {
      await api.customers.create(data)
      await reloadActiveRoute()
    },
    [reloadActiveRoute]
  )

  const update = useCallback(
    async (id: number, data: UpdateCustomerDTO) => {
      await api.customers.update(id, data)
      await reloadActiveRoute()
    },
    [reloadActiveRoute]
  )

  const remove = useCallback(
    async (id: number) => {
      await api.customers.delete(id)
      await reloadActiveRoute()
    },
    [reloadActiveRoute]
  )

  return { routes, customers, activeRouteId, loading, error, setRoute, create, update, remove, reload: reloadActiveRoute }
}