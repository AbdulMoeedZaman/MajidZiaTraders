import { Fragment, useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { invoiceRemaining } from '@shared/types/invoice'
import type { InvoiceDetails } from '@shared/types/invoice'
import type { Payment } from '@shared/types/payment'

interface Props {
  invoiceId: number
  onBack: () => void
}

function printDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

function printMoney(cents: number | null | undefined): string {
  return (
    'Rs.' +
    ((cents ?? 0) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

export function InvoiceDetailPage({ invoiceId, onBack }: Props) {
  const [data, setData] = useState<InvoiceDetails | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmPay, setConfirmPay] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [details, desc, pays] = await Promise.all([
        api.invoices.getWithDetails(invoiceId),
        api.settings.getValue('invoice_description'),
        api.payments.listByInvoice(invoiceId),
      ])
      setData(details)
      setDescription(desc ?? '')
      setPayments(pays)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoice')
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    void load()
  }, [load])

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null)
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
      setConfirmCancel(false)
      setConfirmPay(false)
    }
  }

  const handlePay = () =>
    runAction(async () => {
      if (!data) return
      await api.invoices.pay(invoiceId, invoiceRemaining(data.invoice))
      await load()
    })

  const handleCancel = () =>
    runAction(async () => {
      await api.invoices.cancel(invoiceId)
      await load()
    })

  const handleDelete = () =>
    runAction(async () => {
      await api.invoices.delete(invoiceId)
      onBack()
    })

  if (loading) return <div className="placeholder"><h3>Loading invoice…</h3></div>
  if (error) return <div className="error-screen">{error}</div>
  if (!data) return <div className="error-screen">This invoice does not exist anymore.</div>

  const { invoice, customer, owner, broker } = data
  const totalCtn = invoice.items.reduce((sum, it) => sum + it.cartonCount, 0)
  const totalPcs = invoice.items.reduce((sum, it) => sum + it.boxCount, 0)
  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = invoiceRemaining(invoice)
  const cancelled = invoice.status === 'cancelled'

  return (
    <div className="feature">
      <div className="toolbar">
        <div className="spacer" />
        {!cancelled && remaining > 0 && (
          confirmPay ? (
            <span className="confirm-bar">
              <button className="btn primary small" onClick={() => void handlePay()} disabled={busy}>
                Confirm payment
              </button>
              <button className="btn ghost small" onClick={() => setConfirmPay(false)} disabled={busy}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="btn primary" onClick={() => setConfirmPay(true)}>
              Pay
            </button>
          )
        )}
        <button className="btn ghost" onClick={() => window.print()}>
          🖨 Print
        </button>
        {!cancelled &&
          (confirmCancel ? (
            <span className="confirm-bar">
              <button className="btn danger small" onClick={() => void handleCancel()} disabled={busy}>
                Confirm cancellation
              </button>
              <button className="btn ghost small" onClick={() => setConfirmCancel(false)} disabled={busy}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="btn danger" onClick={() => setConfirmCancel(true)} disabled={busy}>
              Cancel invoice
            </button>
          ))}
        {!invoice.paidAmount &&
          (confirmDelete ? (
            <span className="confirm-bar">
              <button className="btn danger small" onClick={() => void handleDelete()} disabled={busy}>
                Confirm delete
              </button>
              <button className="btn ghost small" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="btn ghost danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete
            </button>
          ))}
      </div>

      {actionError && <div className="form-error">{actionError}</div>}

      <div className="invoice-sheet">
        {/* ── Company Header (centered) ────────────────────────────────── */}
        {owner && (
          <div className="sheet-head">
            <div className="ip-owner">{owner.name}</div>
            <div className="ip-subtitle">
              {owner.address && <span className="ip-address">{owner.address}</span>}
              {owner.address && owner.phone && <span className="ip-comma">,</span>}
              {owner.phone && <span className="ip-phone">{owner.phone}</span>}
            </div>
          </div>
        )}

        <div className="ip-title">
          <span className="ip-title-number">{invoice.invoiceNumber}</span>
        </div>

        {/* ── Metadata boxes ───────────────────────────────────────────── */}
        <div className="ip-meta">
          <div className="ip-customer-box">
            {customer && (
              <>
                <div className="ip-meta-line"><span>Shop name:</span> <strong>{customer.shopName}</strong></div>
                <div className="ip-meta-line"><span>Owner name:</span> <strong>{customer.ownerName}</strong></div>
                <div className="ip-meta-line"><span>Address:</span> <strong>{customer.address}</strong></div>
                <div className="ip-meta-line"><span>Phone:</span> <strong>{customer.phone}</strong></div>
                <div className="ip-meta-line"><span>Status:</span> <strong>{invoice.filerStatus === 'filer' ? 'Filer' : 'Non Filer'}</strong></div>
              </>
            )}
          </div>
          <div className="ip-meta-right">
            <div className="ip-meta-line right"><span>Date:</span> <strong>{printDate(invoice.date)}</strong></div>
            {broker && (
              <>
                <div className="ip-meta-line right"><span>Booker name:</span> <strong>{broker.name}</strong></div>
                <div className="ip-meta-line right"><span>Booker phone:</span> <strong>{broker.phone ?? '—'}</strong></div>
              </>
            )}
          </div>
        </div>

        {/* ── Items table ──────────────────────────────────────────────── */}
        <table className="ip-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty.</th>
              <th>Unit</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => {
              const cartonAmt = item.rate * item.cartonCount
              const boxAmt = item.amount - cartonAmt
              const hasCtn = item.cartonCount > 0
              const hasPcs = item.boxCount > 0

              if (!hasCtn && !hasPcs) {
                return (
                  <tr key={item.id ?? i}>
                    <td>{item.productName}</td>
                    <td className="ip-num">0</td>
                    <td className="ip-unit">—</td>
                    <td className="ip-num">—</td>
                    <td className="ip-num">{printMoney(item.amount)}</td>
                  </tr>
                )
              }

              return (
                <Fragment key={item.id ?? i}>
                  {hasCtn && (
                    <tr>
                      <td>
                        {item.productName}
                        {hasPcs && <span className="ip-line-note"> ({item.boxesPerCarton} pcs/ctn)</span>}
                      </td>
                      <td className="ip-num">{item.cartonCount}</td>
                      <td className="ip-unit">Ctn</td>
                      <td className="ip-num">{printMoney(item.rate)}</td>
                      <td className="ip-num">{printMoney(cartonAmt)}</td>
                    </tr>
                  )}
                  {hasPcs && (
                    <tr>
                      <td>{hasCtn ? '' : item.productName}</td>
                      <td className="ip-num">{item.boxCount}</td>
                      <td className="ip-unit">Pcs</td>
                      <td className="ip-num">—</td>
                      <td className="ip-num">{printMoney(boxAmt)}</td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        {/* ── Footer: quantities / balances + financials ────────────────── */}
        <div className="ip-footer">
          <div className="ip-left-col">
            <div className="ip-box">
              <div className="ip-box-heading">Quantity Breakdown</div>
              <div className="ip-sum-row"><span>Total Ctn (Cartons)</span><strong>{totalCtn}</strong></div>
              <div className="ip-sum-row"><span>Total Pcs</span><strong>{totalPcs}</strong></div>
            </div>
          </div>

          <div className="ip-finance">
            <div className="ip-fin-row"><span>Total Gross Amount</span><strong>{printMoney(invoice.subtotal)}</strong></div>
            <div className="ip-fin-row"><span>Previous Balance</span><strong>{'—'}</strong></div>
            <div className="ip-fin-row">
              <span>Tax</span>
              <strong>{invoice.tax != null ? printMoney(invoice.tax) : '—'}</strong>
            </div>
            <div className="ip-fin-row ip-net">
              <span>Net Amount / Grand Total</span>
              <strong>{printMoney(invoice.grandTotal ?? invoice.subtotal)}</strong>
            </div>
            <div className="ip-fin-row"><span>Received</span><strong>{printMoney(paidTotal)}</strong></div>
          </div>
        </div>

        {/* ── Signature ────────────────────────────────────────────────── */}
        <div className="ip-signatures">
          <div className="ip-signature-field">
            <div className="ip-signature-line" />
            <span>Signature</span>
          </div>
        </div>

        {description && (
          <div
            className="ip-description"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

      </div>

      <div className="section-title">Payments</div>
      {payments.length === 0 ? (
        <div className="empty-state">
          <p>
            {cancelled
              ? 'This invoice was cancelled — no payments were kept.'
              : 'No payments recorded yet.'}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{printDate(p.date)}</td>
                  <td className="num mono">{printMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="expense-total-row">
                <th>Total received</th>
                <th className="num mono">{printMoney(paidTotal)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}