import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import type { ProductWithStock } from '@shared/types/inventory'
import type { CreateProductDTO, UpdateProductDTO } from '@shared/types/product'

export type CatalogFilter = 'all' | 'active' | 'inactive'

export function useProducts() {
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<CatalogFilter>('all')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.products.listWithStock()
      setProducts(list)
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
    let list = products
    if (filter === 'active') list = list.filter((p) => p.isActive === 1)
    else if (filter === 'inactive') list = list.filter((p) => p.isActive === 0)

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [products, filter, query])

  const createProduct = useCallback(
    async (data: CreateProductDTO): Promise<string | null> => {
      try {
        await api.products.create(data)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const updateProduct = useCallback(
    async (id: number, data: UpdateProductDTO): Promise<string | null> => {
      try {
        await api.products.update(id, data)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const setProductActive = useCallback(
    async (id: number, isActive: boolean): Promise<string | null> => {
      try {
        await api.products.setActive(id, isActive)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const deleteProduct = useCallback(
    async (id: number): Promise<string | null> => {
      try {
        await api.products.delete(id)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  return {
    products,
    visible,
    loading,
    error,
    filter,
    setFilter,
    query,
    setQuery,
    createProduct,
    updateProduct,
    setProductActive,
    deleteProduct,
    reload: load,
  }
}