import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import type { ProductWithStock } from '@shared/types/inventory'
import type { CreateProductDTO, UpdateProductDTO } from '@shared/types/product'
import type { AddStockDTO } from '@shared/types/restock'

export function useProducts() {
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      )
    }
    return list
  }, [products, query])

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

  const addStock = useCallback(
    async (data: AddStockDTO): Promise<string | null> => {
      try {
        await api.products.addStock(data)
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
    query,
    setQuery,
    createProduct,
    updateProduct,
    deleteProduct,
    addStock,
    reload: load,
  }
}