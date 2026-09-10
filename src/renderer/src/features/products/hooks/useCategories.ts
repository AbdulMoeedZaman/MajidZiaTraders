import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import type { Category } from '@shared/types/category'

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCategories(await api.categories.list())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categoryName = useCallback(
    (id: number | null): string => {
      if (id == null) return 'Uncategorized'
      return categories.find((c) => c.id === id)?.name ?? 'Unknown'
    },
    [categories]
  )

  const run = useCallback(
    async (fn: () => Promise<unknown>): Promise<string | null> => {
      try {
        await fn()
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const createCategory = useCallback((name: string) => run(() => api.categories.create({ name: name.trim() })), [run])
  const renameCategory = useCallback(
    (id: number, name: string) => run(() => api.categories.update(id, { name: name.trim() })),
    [run]
  )
  const setCategoryActive = useCallback(
    (id: number, active: boolean) => run(() => api.categories.setActive(id, active)),
    [run]
  )
  const deleteCategory = useCallback((id: number) => run(() => api.categories.delete(id)), [run])

  return {
    categories,
    loading,
    error,
    reload: load,
    categoryName,
    createCategory,
    renameCategory,
    setCategoryActive,
    deleteCategory,
  }
}
