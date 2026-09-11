import { useCallback, useEffect, useState } from 'react'
import type { InvoiceWithItems } from '@shared/types/invoice'
import type { CustomerPaymentWithCustomer } from '@shared/types/customer-payment'
import type { CustomerWithBalance } from '@shared/types/customer'
import type { BusinessProfile } from '@shared/types/business-profile'
import { api } from '../../../lib/api'
import { useInvoices } from '../hooks/useInvoices'
import { usePayments } from '../../payments/hooks/usePayments'
import { PaymentForm } from '../../payments/components/PaymentForm'
import { statusBadgeTone } from './InvoiceList'
import { INVOICE_STATUS_LABELS } from '../types/invoice-form'
import { PAYMENT_METHOD_LABELS } from '../../payments/types/payment-form'
import { formatDate, formatMoney } from '../../../lib/format'

interface InvoiceDetailPageProps {
  invoiceId: number
  onBack: () => void
}

export function InvoiceDetailPage({ invoiceId, onBack }: InvoiceDetailPageProps) {
  const { cancelInvoice, deleteInvoice } = useInvoices()
  const { deletePayment } = usePayments()
  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null)
  const [payments, setPayments] = useState<CustomerPaymentWithCustomer[]>([])
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([])
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [confirmPaymentDelete, setConfirmPaymentDelete] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.invoices.getWithItems(invoiceId)
      if (!data) setError('Invoice not found')
      else setInvoice(data)
      setPayments(await api.payments.listByInvoice(invoiceId))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api.customers
      .listWithBalance()
      .then(setCustomers)
      .catch(() => setCustomers([]))
    api.businessProfile
      .get()
      .then(setProfile)
      .catch(() => setProfile(null))
  }, [])

  const run = async (fn: () => Promise<string | null>) => {
    setActionError(null)
    const err = await fn()
    if (err) setActionError(err)
    else {
      setConfirmCancel(false)
      setConfirmDelete(false)
      await load()
    }
  }

  const handleDelete = async () => {
    setActionError(null)
    const err = await deleteInvoice(invoiceId)
    if (err) setActionError(err)
    else onBack()
  }

  const handlePaymentDelete = async (id: number) => {
    setActionError(null)
    const err = await deletePayment(id)
    if (err) setActionError(err)
    else await load()
    setConfirmPaymentDelete(null)
  }

  if (loading) {
    return (
      <div className="feature">
        <div className="muted">Loading invoice…</div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="feature">
        <div className="form-error">{error ?? 'Invoice not found'}</div>
        <button className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    )
  }

  // Payments recorded against this invoice block cancelling; automatically applied customer
  // credit does not (it goes back to the customer when the invoice is cancelled).
  const hasDirectPayments = payments.some((p) => p.invoiceId === invoice.id)
  const canModify = !hasDirectPayments && invoice.status !== 'cancelled'
  const canRecordPayment = invoice.status !== 'cancelled' && invoice.outstanding > 0
  const address = profile ? [profile.address, profile.city, profile.country].filter(Boolean).join(', ') : ''
  const contact = profile ? [profile.phone, profile.email].filter(Boolean).join(' · ') : ''

  return (
    <div className="feature">
      {actionError && <div className="form-error">{actionError}</div>}

      {profile && (
        <div className="print-only print-header">
          <h2>{profile.name}</h2>
          {address && <div>{address}</div>}
          {contact && <div>{contact}</div>}
        </div>
      )}

      <div className="detail">
        <div className="detail-header">
          <div>
            <h3>Invoice {invoice.invoiceNumber}</h3>
            <span className="muted">
              {invoice.customerName} · {formatDate(invoice.date)}
              {invoice.dueDate ? ` · due ${formatDate(invoice.dueDate)}` : ''}
              {invoice.notes ?? ''}
            </span>
          </div>
          <span className={`badge ${statusBadgeTone(invoice.status)}`}>
            {INVOICE_STATUS_LABELS[invoice.status]}
          </span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
              <th className="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td className="mono">{item.productSku}</td>
                <td className="num">{item.quantity}</td>
                <td className="num">{formatMoney(item.actualSellingPrice)}</td>
                <td className="num">{formatMoney(item.lineSubtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="summary-grid">
        <div className="totals-column">
          <div className="totals-row">
            <span>Subtotal</span>
            <span>{formatMoney(invoice.subtotal)}</span>
          </div>
          {invoice.discount > 0 && (
            <div className="totals-row">
              <span>Discount</span>
              <span>−{formatMoney(invoice.discount)}</span>
            </div>
          )}
          <div className="totals-row strong">
            <span>Total</span>
            <span>{formatMoney(invoice.total)}</span>
          </div>
          {invoice.status !== 'cancelled' && (
            <>
              <div className="totals-row">
                <span>Paid{invoice.paid > 0 && !hasDirectPayments ? ' (customer credit)' : ''}</span>
                <span>{formatMoney(invoice.paid)}</span>
              </div>
              <div className="totals-row">
                <span>Outstanding</span>
                <span>{formatMoney(invoice.outstanding)}</span>
              </div>
            </>
          )}
          <div className="totals-row no-print">
            <span>Profit</span>
            <span>{formatMoney(invoice.totalProfit)}</span>
          </div>
        </div>
      </div>

      <div className="detail-actions">
        {canRecordPayment && (
          <button className="btn primary" onClick={() => setPaymentOpen(true)}>
            + Record payment
          </button>
        )}
        {canModify && (
          <button
            className="btn"
            onClick={() => {
              setConfirmCancel(true)
              setConfirmDelete(false)
            }}
          >
            Cancel invoice
          </button>
        )}
        {(canModify || invoice.status === 'cancelled') && (
          <button
            className="btn danger"
            onClick={() => {
              setConfirmDelete(true)
              setConfirmCancel(false)
            }}
          >
            Delete invoice
          </button>
        )}
        <button className="btn" onClick={() => window.print()}>
          Print
        </button>
      </div>

      {invoice.status !== 'cancelled' && (
        <>
          <h4 className="section-title">Payments</h4>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No payments yet.
                    </td>
                  </tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paymentDate)}</td>
                    <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                    <td>
                      {p.reference ?? ''}
                      {p.invoiceId !== invoice.id && <div className="fine-text muted">Applied automatically (customer credit)</div>}
                    </td>
                    <td className="num">
                      {formatMoney(p.appliedAmount ?? p.amount)}
                      {p.appliedAmount !== undefined && p.appliedAmount !== p.amount && (
                        <div className="fine-text muted">of {formatMoney(p.amount)} payment</div>
                      )}
                    </td>
                    <td className="actions-col">
                      <button
                        className="btn small danger"
                        onClick={() => {
                          if (confirmPaymentDelete === p.id) void handlePaymentDelete(p.id)
                          else {
                            setConfirmPaymentDelete(p.id)
                            window.setTimeout(
                              () => setConfirmPaymentDelete((cur) => (cur === p.id ? null : cur)),
                              3000
                            )
                          }
                        }}
                      >
                        {confirmPaymentDelete === p.id ? 'Confirm' : 'Delete'}
                      </button>
                      {confirmPaymentDelete === p.id && (p.allocationCount ?? 1) > 1 && (
                        <div className="fine-text text-warn">
                          Also removes it from {(p.allocationCount ?? 1) - 1} other invoice(s)
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {profile?.invoiceFooter && <div className="print-only print-footer">{profile.invoiceFooter}</div>}

      {canModify && confirmCancel && (
        <div className="confirm-bar">
          <span>
            This reverses stock and removes the customer ledger entry
            {invoice.paid > 0 ? '. Customer credit applied to it goes back to the customer' : ''}.
          </span>
          <button className="btn primary" onClick={() => void run(() => cancelInvoice(invoiceId))}>
            Confirm cancel
          </button>
          <button className="btn ghost" onClick={() => setConfirmCancel(false)}>
            Keep
          </button>
        </div>
      )}
      {confirmDelete && (canModify || invoice.status === 'cancelled') && (
        <div className="confirm-bar">
          <span>
            This permanently deletes the invoice
            {invoice.status !== 'cancelled' ? ', restores stock, and removes the ledger entry' : ''}.
          </span>
          <button className="btn danger" onClick={() => void handleDelete()}>
            Confirm delete
          </button>
          <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
            Keep
          </button>
        </div>
      )}

      {paymentOpen && (
        <Modal title={`Payment for ${invoice.invoiceNumber}`} onClose={() => setPaymentOpen(false)}>
          <PaymentForm
            customers={customers}
            invoice={invoice}
            onSuccess={() => {
              setPaymentOpen(false)
              void load()
            }}
            onCancel={() => setPaymentOpen(false)}
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
  children: React.ReactNode
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