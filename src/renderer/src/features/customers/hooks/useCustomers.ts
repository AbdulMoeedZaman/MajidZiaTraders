import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import type { CustomerWithBalance } from '@shared/types/customer'
import type { CreateCustomerDTO, UpdateCustomerDTO } from '@shared/types/customer'

export function useCustomers() {
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCustomers(await api.customers.listWithBalance())
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
    let list = customers

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.address ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [customers, query])

  const outstandingCount = useMemo(() => customers.filter((c) => c.outstanding > 0).length, [customers])

  const createCustomer = useCallback(
    async (data: CreateCustomerDTO): Promise<string | null> => {
      try {
        await api.customers.create(data)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const updateCustomer = useCallback(
    async (id: number, data: UpdateCustomerDTO): Promise<string | null> => {
      try {
        await api.customers.update(id, data)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const deleteCustomer = useCallback(
    async (id: number): Promise<string | null> => {
      try {
        await api.customers.delete(id)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  return {
    customers,
    visible,
    loading,
    error,
    outstandingCount,
    query,
    setQuery,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    reload: load,
  }
}