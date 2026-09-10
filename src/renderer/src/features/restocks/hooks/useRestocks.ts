import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import type { RestockListItem, CreateRestockDTO, UpdateRestockDTO } from '@shared/types/restock'
import type { RestockFilter } from '../types/restock-form'

export function useRestocks() {
  const [restocks, setRestocks] = useState<RestockListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<RestockFilter>('all')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRestocks(await api.restocks.listWithCounts())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(() => {
    let list = restocks
    if (filter !== 'all') list = list.filter((r) => r.status === filter)

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (r) =>
          r.referenceNumber.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q)
      )
    }
    return list
  }, [restocks, filter, query])

  const createRestock = useCallback(
    async (data: CreateRestockDTO): Promise<string | null> => {
      try {
        await api.restocks.create(data)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const updateRestock = useCallback(
    async (id: number, data: UpdateRestockDTO): Promise<string | null> => {
      try {
        await api.restocks.update(id, data)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const markReceived = useCallback(
    async (id: number, options?: { updateCost?: boolean }): Promise<string | null> => {
      try {
        await api.restocks.markReceived(id, options)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const cancel = useCallback(
    async (id: number): Promise<string | null> => {
      try {
        await api.restocks.cancel(id)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const deleteRestock = useCallback(
    async (id: number): Promise<string | null> => {
      try {
        await api.restocks.delete(id)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const getWithItems = useCallback((id: number) => api.restocks.getWithItems(id), [])

  return {
    restocks,
    visible,
    loading,
    error,
    filter,
    setFilter,
    query,
    setQuery,
    createRestock,
    updateRestock,
    markReceived,
    cancel,
    deleteRestock,
    getWithItems,
    reload: load,
  }
}