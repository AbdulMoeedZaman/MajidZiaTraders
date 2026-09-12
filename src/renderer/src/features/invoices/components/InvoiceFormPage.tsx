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

interface Props {
  preselectCustomerId?: number | null
  onCreated: (invoiceId: number) => void
}

export function InvoiceFormPage({ preselectCustomerId, onCreated }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, b, p] = await Promise.all([
        api.customers.list(),
        api.brokers.list(),
        api.products.list(),
      ])
      setCustomers(c)
      setBrokers(b)
      setProducts(p)
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
      remaining: values.remaining.trim() === '' ? null : moneyToCents(values.remaining),
      tax: values.tax.trim() === '' ? null : moneyToCents(values.tax),
      grandTotal: values.grandTotal.trim() === '' ? null : moneyToCents(values.grandTotal),
      items: values.items.map((l) => ({
        productId: l.productId as number,
        rate: moneyToCents(l.rate),
        cartonCount: Number(l.cartonCount) || 0,
        boxCount: Number(l.boxCount) || 0,
      })),
    }
    const created = await api.invoices.create(dto)
    onCreated(created.id)
  }

  if (loading) return <div className="placeholder"><h3>Loading invoice form…</h3></div>
  if (error) return <div className="error-screen">{error}</div>

  return (
    <InvoiceForm
      customers={customers}
      brokers={brokers}
      products={products}
      preselectCustomerId={preselectCustomerId}
      onSubmit={submit}
    />
  )
}