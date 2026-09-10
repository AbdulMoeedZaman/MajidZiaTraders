import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import type { CustomerLedgerEntryWithBalance, CustomerLedgerSummary } from '@shared/types/customer-ledger'

export function useCustomerLedger(customerId: number) {
  const [entries, setEntries] = useState<CustomerLedgerEntryWithBalance[]>([])
  const [summary, setSummary] = useState<CustomerLedgerSummary | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rows, summ] = await Promise.all([
        api.customerLedger.list(customerId, from || undefined, to || undefined),
        api.customerLedger.summary(customerId),
      ])
      setEntries(rows)
      setSummary(summ)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [customerId, from, to])

  useEffect(() => {
    load()
  }, [load])

  return {
    entries,
    summary,
    from,
    to,
    setFrom,
    setTo,
    loading,
    error,
    reload: load,
  }
}