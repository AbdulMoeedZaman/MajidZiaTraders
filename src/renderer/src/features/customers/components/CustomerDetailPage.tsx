import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { formatDate, formatMoney } from '../../../lib/format'
import type { CustomerWithRoute } from '@shared/types/customer'
import type { InvoiceWithCustomer } from '@shared/types/invoice'

interface Props {
  customerId: number
  onBack: () => void
  onNewInvoice: (customerId: number) => void
  onOpenInvoice: (invoiceId: number) => void
}

export function CustomerDetailPage({ customerId, onBack, onNewInvoice, onOpenInvoice }: Props) {
  const [customer, setCustomer] = useState<CustomerWithRoute | null>(null)
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, inv] = await Promise.all([
        api.customers.getById(customerId),
        api.invoices.listByCustomer(customerId),
      ])
      setCustomer(c)
      setInvoices(inv)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customer')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <div className="placeholder"><h3>Loading customer…</h3></div>
  if (error) return <div className="error-screen">{error}</div>
  if (!customer)
    return <div className="error-screen">This customer does not exist anymore.</div>

  return (
    <div className="feature">
      <div className="toolbar">
        <button className="btn ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="spacer" />
        <button className="btn primary" onClick={() => onNewInvoice(customer.id)}>
          + New Invoice
        </button>
      </div>

      <div className="detail detail-rows">
        <div>
          <h3>
            {customer.shopName || customer.ownerName}
            {' · '}
            <span className="mono">{customer.code}</span>
          </h3>
          <div className="customer-meta">
            <div>
              <dt>Route</dt>
              <dd>{customer.routeName}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{customer.ownerName || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{customer.phone || '—'}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{customer.address || '—'}</dd>
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">Invoices</div>
      {invoices.length === 0 ? (
        <div className="empty-state">
          <p>No invoices for this customer yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice no.</th>
                <th>Date</th>
                <th className="num">Subtotal</th>
                <th className="num">Grand total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} onClick={() => onOpenInvoice(inv.id)}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td className="num mono">{formatMoney(inv.subtotal)}</td>
                  <td className="num mono">{formatMoney(inv.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}