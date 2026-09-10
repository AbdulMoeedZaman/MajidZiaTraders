import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { CustomerWithBalance } from '@shared/types/customer'
import { api } from '../../../lib/api'
import { usePayments } from '../hooks/usePayments'
import { PaymentForm } from './PaymentForm'
import { PAYMENT_METHOD_LABELS } from '../types/payment-form'
import { formatDate, formatMoney } from '../../../lib/format'

export function PaymentsList() {
  const { payments, loading, error, deletePayment, reload } = usePayments()
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    api.customers
      .listWithBalance('active')
      .then(setCustomers)
      .catch(() => setCustomers([]))
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return payments
    return payments.filter(
      (p) =>
        p.customerName.toLowerCase().includes(q) ||
        (p.invoiceNumber ?? '').toLowerCase().includes(q) ||
        p.method.toLowerCase().includes(q)
    )
  }, [payments, query])

  const handleDelete = useCallback(
    async (id: number) => {
      setActionError(null)
      const err = await deletePayment(id)
      if (err) setActionError(err)
      setConfirmId(null)
    },
    [deletePayment]
  )

  return (
    <div className="feature">
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search customer, invoice or method…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="spacer" />
        <button className="btn primary" onClick={() => setFormOpen(true)}>
          + Record payment
        </button>
      </div>

      {actionError && <div className="form-error">{actionError}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : error ? (
        <div className="form-error">{error}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Invoice</th>
                <th>Method</th>
                <th className="num">Amount</th>
                <th>Reference</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No payments found.
                  </td>
                </tr>
              )}
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.paymentDate)}</td>
                  <td>{p.customerName}</td>
                  <td className="mono">{p.invoiceNumber ?? '—'}</td>
                  <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                  <td className="num">
                    {formatMoney(p.amount)}
                    {(p.unappliedAmount ?? 0) > 0 && (
                      <div className="fine-text muted">{formatMoney(p.unappliedAmount)} unapplied credit</div>
                    )}
                  </td>
                  <td>{p.reference ?? ''}</td>
                  <td className="actions-col">
                    <button
                      className="btn small danger"
                      onClick={() => {
                        if (confirmId === p.id) void handleDelete(p.id)
                        else {
                          setConfirmId(p.id)
                          window.setTimeout(() => setConfirmId((cur) => (cur === p.id ? null : cur)), 3000)
                        }
                      }}
                    >
                      {confirmId === p.id ? 'Confirm' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <Modal title="Record payment" onClose={() => setFormOpen(false)}>
          <PaymentForm
            customers={customers}
            onSuccess={() => {
              setFormOpen(false)
              void reload()
            }}
            onCancel={() => setFormOpen(false)}
          />
        </Modal>
      )}
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close" title="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}