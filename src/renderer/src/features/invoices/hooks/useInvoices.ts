import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import type { InvoiceWithCustomer, CreateInvoiceDTO } from '@shared/types/invoice'
import type { InvoiceStatusFilter } from '../types/invoice-form'

export function useInvoices() {
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<InvoiceStatusFilter>('all')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInvoices(await api.invoices.list())
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
    let list = invoices
    if (filter !== 'all') list = list.filter((i) => i.status === filter)

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(q) ||
          i.customerName.toLowerCase().includes(q)
      )
    }
    return list
  }, [invoices, filter, query])

  const createInvoice = useCallback(
    async (data: CreateInvoiceDTO): Promise<string | null> => {
      try {
        await api.invoices.create(data)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const cancelInvoice = useCallback(
    async (id: number): Promise<string | null> => {
      try {
        await api.invoices.cancel(id)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const deleteInvoice = useCallback(
    async (id: number): Promise<string | null> => {
      try {
        await api.invoices.delete(id)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const getWithItems = useCallback((id: number) => api.invoices.getWithItems(id), [])

  return {
    invoices,
    visible,
    loading,
    error,
    filter,
    setFilter,
    query,
    setQuery,
    createInvoice,
    cancelInvoice,
    deleteInvoice,
    getWithItems,
    reload: load,
  }
}