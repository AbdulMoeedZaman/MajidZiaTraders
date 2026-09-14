import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { moneyToCents } from '../../../lib/money'
import { localDate } from '../../../lib/format'
import { InvoiceForm } from './InvoiceForm'
import type { InvoiceFormValues } from './InvoiceForm'
import type { Broker } from '@shared/types/broker'
import type { Product } from '@shared/types/product'
import type { Customer } from '@shared/types/customer'
import type { CreateInvoiceDTO, FilerStatus } from '@shared/types/invoice'
import type { Route } from '@shared/types/route'

interface Props {
  preselectCustomerId?: number | null
  onCreated: (invoiceId: number) => void
}

export function InvoiceFormPage({ preselectCustomerId, onCreated }: Props) {
  const [routes, setRoutes] = useState<Route[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [stockLevels, setStockLevels] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [r, c, b, p, levels] = await Promise.all([
        api.routes.list(),
        api.customers.list(),
        api.brokers.list(),
        api.products.list(),
        api.stock.levels(),
      ])
      setRoutes(r)
      setCustomers(c)
      setBrokers(b)
      setProducts(p)
      const map: Record<number, number> = {}
      for (const lv of levels) map[lv.productId] = lv.quantity
      setStockLevels(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoice data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (values: InvoiceFormValues) => {
    const dto: CreateInvoiceDTO = {
      customerId: values.customerId as number,
      brokerId: values.brokerId as number,
      date: localDate(new Date()),
      filerStatus: values.filerStatus as FilerStatus,
      tax: values.tax.trim() === '' ? null : moneyToCents(values.tax),
      items: values.items.map((l) => ({
        productId: l.productId as number,
        rate: moneyToCents(l.rate),
        cartonCount: Number(l.cartons) || 0,
        boxCount: Number(l.pieces) || 0,
      })),
    }
    const created = await api.invoices.create(dto)
    onCreated(created.id)
  }

  if (loading) return <div className="placeholder"><h3>Loading invoice form…</h3></div>
  if (error) return <div className="error-screen">{error}</div>

  return (
    <InvoiceForm
      routes={routes}
      customers={customers}
      brokers={brokers}
      products={products}
      stockLevels={stockLevels}
      preselectCustomerId={preselectCustomerId}
      onSubmit={submit}
    />
  )
}