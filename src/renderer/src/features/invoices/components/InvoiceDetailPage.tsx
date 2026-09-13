import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { invoiceRemaining } from '@shared/types/invoice'
import type { InvoiceDetails } from '@shared/types/invoice'

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
      const [details, desc] = await Promise.all([
        api.invoices.getWithDetails(invoiceId),
        api.settings.getValue('invoice_description'),
      ])
      setData(details)
      setDescription(desc ?? '')
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
                <div className="ip-meta-line"><span>Address:</span> {customer.address}</div>
                <div className="ip-meta-line"><span>Phone:</span> {customer.phone}</div>
                <div className="ip-meta-line"><span>Status:</span>{invoice.filerStatus === 'filer' ? 'Filer' : 'Non Filer'}</div>
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
              <th>Products</th>
              <th>Rate</th>
              <th>Cartons</th>
              <th>Boxes</th>
              <th>Scheme</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={item.id ?? i}>
                <td>{item.productName}</td>
                <td className="ip-num">{printMoney(item.rate)}</td>
                <td className="ip-num">{item.cartonCount}</td>
                <td className="ip-num">{item.boxCount}</td>
                <td className="ip-scheme" />
                <td className="ip-num">{printMoney(item.amount)}</td>
              </tr>
            ))}
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
    </div>
  )
}