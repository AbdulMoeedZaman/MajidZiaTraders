import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import type { ProductWithStock, StockMovement } from '@shared/types/inventory'
import type { CreateStockAdjustmentDTO } from '@shared/types/stock-adjustment'

export type StockFilter = 'all' | 'low' | 'out'

export function useInventory() {
  const [items, setItems] = useState<ProductWithStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StockFilter>('all')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await api.products.listWithStock())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const lowCount = useMemo(() => items.filter((i) => i.isLowStock).length, [items])
  const outCount = useMemo(() => items.filter((i) => i.isOutOfStock).length, [items])

  const visible = useMemo(() => {
    let list = items
    if (filter === 'low') list = list.filter((i) => i.isLowStock)
    else if (filter === 'out') list = list.filter((i) => i.isOutOfStock)

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
      )
    }
    return list
  }, [items, filter, query])

  const setOpeningStock = useCallback(
    async (productId: number, quantity: number): Promise<string | null> => {
      try {
        await api.inventory.setOpeningStock({ productId, quantity })
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const adjustStock = useCallback(
    async (data: CreateStockAdjustmentDTO): Promise<string | null> => {
      try {
        await api.stockAdjustments.create(data)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const loadMovements = useCallback(
    async (productId: number): Promise<StockMovement[]> => {
      return api.inventory.listMovements(productId)
    },
    []
  )

  return {
    items,
    visible,
    loading,
    error,
    lowCount,
    outCount,
    filter,
    setFilter,
    query,
    setQuery,
    setOpeningStock,
    adjustStock,
    loadMovements,
    reload: load,
  }
}