import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import type { Product, CreateProductDTO, UpdateProductDTO } from '@shared/types/product'

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProducts(await api.products.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async (data: CreateProductDTO) => {
    await api.products.create(data)
    await load()
  }

  const update = async (id: number, data: UpdateProductDTO) => {
    await api.products.update(id, data)
    await load()
  }

  const remove = async (id: number) => {
    await api.products.delete(id)
    await load()
  }

  return { products, loading, error, reload: load, create, update, remove }
}