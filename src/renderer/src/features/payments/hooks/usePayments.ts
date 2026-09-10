import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import type { CreateCustomerPaymentDTO, CustomerPaymentWithCustomer } from '@shared/types/customer-payment'

export function usePayments() {
  const [payments, setPayments] = useState<CustomerPaymentWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPayments(await api.payments.list())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const recordPayment = useCallback(
    async (data: CreateCustomerPaymentDTO): Promise<string | null> => {
      try {
        await api.payments.create(data)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const deletePayment = useCallback(
    async (id: number): Promise<string | null> => {
      try {
        await api.payments.delete(id)
        await load()
        return null
      } catch (e) {
        return String(e)
      }
    },
    [load]
  )

  const listByInvoice = useCallback(
    (invoiceId: number): Promise<CustomerPaymentWithCustomer[]> =>
      api.payments.listByInvoice(invoiceId),
    []
  )

  return {
    payments,
    loading,
    error,
    recordPayment,
    deletePayment,
    listByInvoice,
    reload: load,
  }
}