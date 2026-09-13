import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { formatDate, formatMoney } from '../../../lib/format'
import { invoiceRemaining } from '@shared/types/invoice'
import { StatusBadge } from '../../../components/StatusBadge'
import { PayModal } from './PayModal'
import type { CustomerWithRoute } from '@shared/types/customer'
import type { InvoiceWithCustomer } from '@shared/types/invoice'
import type { Payment } from '@shared/types/payment'

interface Props {
  customerId: number
  onBack: () => void
  onNewInvoice: (customerId: number) => void
  onOpenInvoice: (invoiceId: number) => void
}

export function CustomerDetailPage({ customerId, onBack, onNewInvoice, onOpenInvoice }: Props) {
  const [customer, setCustomer] = useState<CustomerWithRoute | null>(null)
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPay, setShowPay] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, inv, pays] = await Promise.all([
        api.customers.getById(customerId),
        api.invoices.listByCustomer(customerId),
        api.payments.listByCustomer(customerId),
      ])
      setCustomer(c)
      setInvoices(inv)
      setPayments(pays)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customer')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  const handlePay = async (amount: number) => {
    const result = await api.customers.pay(customerId, amount)
    setSuccess(
      `Received ${formatMoney(result.total)} · ${result.applied
        .map((a) => `${a.invoiceNumber} (${formatMoney(a.amount)})`)
        .join(', ')}`
    )
    setShowPay(false)
    await load()
  }

  if (loading) return <div className="placeholder"><h3>Loading customer…</h3></div>
  if (error) return <div className="error-screen">{error}</div>
  if (!customer)
    return <div className="error-screen">This customer does not exist anymore.</div>

  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0)
  const outstanding = invoices
    .filter((inv) => inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + invoiceRemaining(inv), 0)
  const openCount = invoices.filter((inv) => inv.status === 'unpaid' || inv.status === 'partial').length

  return (
    <div className="feature">
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn primary" onClick={() => { setSuccess(null); setShowPay(true) }}>
          Pay
        </button>
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

      <section className="expense-summary">
        <div className="expense-summary-copy">
          <h3>Balance</h3>
          <span className="muted fine-text">
            Outstanding across {openCount} open invoice{openCount === 1 ? '' : 's'} · {formatMoney(paidTotal)} received
          </span>
        </div>
        <div className="expense-summary-total mono">{formatMoney(outstanding)}</div>
      </section>

      {success && <div className="text-ok fine-text">{success}</div>}

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
                <th>Status</th>
                <th className="num">Subtotal</th>
                <th className="num">Grand total</th>
                <th className="num">Received</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className={inv.status === 'cancelled' ? 'is-cancelled' : ''}
                  onClick={() => onOpenInvoice(inv.id)}
                >
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td className="num mono">{formatMoney(inv.subtotal)}</td>
                  <td className="num mono">{formatMoney(inv.grandTotal)}</td>
                  <td className="num mono">{formatMoney(inv.paidAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title">Payments</div>
      {payments.length === 0 ? (
        <div className="empty-state">
          <p>No payments recorded for this customer yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td className="mono">
                    {invoices.find((inv) => inv.id === p.invoiceId)?.invoiceNumber ?? `INV-${String(p.invoiceId).padStart(6, '0')}`}
                  </td>
                  <td className="num mono">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPay && (
        <PayModal
          customerName={customer.shopName || customer.ownerName}
          outstanding={outstanding}
          openInvoices={openCount}
          onConfirm={handlePay}
          onCancel={() => setShowPay(false)}
        />
      )}
    </div>
  )
}