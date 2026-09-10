import { useCallback, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import { localDate } from '@shared/date'

export type ReportTab =
  | 'sales'
  | 'profitLoss'
  | 'inventory'
  | 'customers'
  | 'payments'
  | 'restocks'
  | 'stockMovements'

export function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    from: localDate(from),
    to: localDate(now),
  }
}

export interface UseReportRangeOptions {
  range: { from: string; to: string }
}

export function useReports() {
  const [tab, setTab] = useState<ReportTab>('sales')
  const [range, setRange] = useState(defaultRange)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sales, setSales] = useState<Awaited<ReturnType<typeof api.reports.sales>> | null>(null)
  const [profitLoss, setProfitLoss] = useState<Awaited<ReturnType<typeof api.reports.profitLoss>> | null>(null)
  const [inventory, setInventory] = useState<Awaited<ReturnType<typeof api.reports.inventory>> | null>(null)
  const [customers, setCustomers] = useState<Awaited<ReturnType<typeof api.reports.customers>> | null>(null)
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof api.reports.payments>> | null>(null)
  const [restocks, setRestocks] = useState<Awaited<ReturnType<typeof api.reports.restocks>> | null>(null)
  const [stockMovements, setStockMovements] = useState<Awaited<ReturnType<typeof api.reports.stockMovements>> | null>(null)

  const load = useCallback(
    async (rangeOverride?: { from: string; to: string }) => {
      const effective = rangeOverride ?? range
      setLoading(true)
      setError(null)
      try {
        const [s, pl, inv, c, p, r, sm] = await Promise.all([
          api.reports.sales(effective.from, effective.to),
          api.reports.profitLoss(effective.from, effective.to),
          api.reports.inventory(),
          api.reports.customers(effective.from, effective.to),
          api.reports.payments(effective.from, effective.to),
          api.reports.restocks(effective.from, effective.to),
          api.reports.stockMovements(effective.from, effective.to),
        ])
        setSales(s)
        setProfitLoss(pl)
        setInventory(inv)
        setCustomers(c)
        setPayments(p)
        setRestocks(r)
        setStockMovements(sm)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    },
    [range]
  )

  const current = useMemo(() => {
    switch (tab) {
      case 'sales':
        return sales
      case 'profitLoss':
        return profitLoss
      case 'inventory':
        return inventory
      case 'customers':
        return customers
      case 'payments':
        return payments
      case 'restocks':
        return restocks
      case 'stockMovements':
        return stockMovements
      default:
        return null
    }
  }, [tab, sales, profitLoss, inventory, customers, payments, restocks, stockMovements])

  return {
    tab,
    setTab,
    range,
    setRange,
    loading,
    error,
    data: current,
    sales,
    profitLoss,
    inventory,
    customers,
    payments,
    restocks,
    stockMovements,
    load,
    reload: load,
    setError,
  }
}