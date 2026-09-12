import { Fragment, useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
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
    '₹' +
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  const handleDelete = async () => {
    setDeleteError(null)
    try {
      await api.invoices.delete(invoiceId)
      onBack()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete invoice')
    }
  }

  if (loading) return <div className="placeholder"><h3>Loading invoice…</h3></div>
  if (error) return <div className="error-screen">{error}</div>
  if (!data) return <div className="error-screen">This invoice does not exist anymore.</div>

  const { invoice, customer, owner, broker } = data
  const totalCtn = invoice.items.reduce((sum, it) => sum + it.cartonCount, 0)
  const totalPcs = invoice.items.reduce((sum, it) => sum + it.boxCount, 0)

  return (
    <div className="feature">
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn primary" onClick={() => window.print()}>
          🖨 Print
        </button>
        {confirmDelete ? (
          <span className="confirm-bar">
            <button className="btn danger small" onClick={() => void handleDelete()}>
              Confirm delete
            </button>
            <button className="btn ghost small" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="btn danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
      </div>

      {deleteError && <div className="form-error">{deleteError}</div>}

      <div className="invoice-sheet">
        {/* ── Company Header (centered) ────────────────────────────────── */}
        {owner && (
          <div className="sheet-head">
            <div className="ip-owner">{owner.name}</div>
            {owner.address && <div className="ip-subtitle">{owner.address}</div>}
            {owner.phone && <div className="ip-subtitle">Phone: {owner.phone}</div>}
          </div>
        )}

        <div className="ip-title">SALES INVOICE</div>

        {/* ── Metadata boxes ───────────────────────────────────────────── */}
        <div className="ip-meta">
          <div className="ip-customer-box">
            {customer && (
              <>
                <div className="ip-meta-line"><span>Shop name:</span> <strong>{customer.shopName}</strong></div>
                <div className="ip-meta-line"><span>Owner name:</span> <strong>{customer.ownerName}</strong></div>
                <div className="ip-meta-line"><span>Address:</span> <strong>{customer.address}</strong></div>
                <div className="ip-meta-line"><span>Phone:</span> <strong>{customer.phone}</strong></div>
              </>
            )}
          </div>
          <div className="ip-meta-right">
            <div className="ip-meta-line right"><span>Invoice No:</span> <strong>{invoice.invoiceNumber}</strong></div>
            <div className="ip-meta-line right"><span>Date:</span> <strong>{printDate(invoice.date)}</strong></div>
            {broker && <div className="ip-meta-line right"><span>O.G.P #:</span> <strong>{broker.name}</strong></div>}
            <div className="ip-meta-line right"><span>Status:</span> <strong>{invoice.filerStatus === 'filer' ? 'Filer' : 'Non Filer'}</strong></div>
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
            <div className="ip-box">
              <div className="ip-box-heading">Account Balance</div>
              <div className="ip-sum-row"><span>Previous Balance</span><strong>{'—'}</strong></div>
              <div className="ip-sum-row"><span>Current Balance</span><strong>{printMoney(invoice.remaining)}</strong></div>
            </div>
          </div>

          <div className="ip-finance">
            <div className="ip-fin-row"><span>Total Gross Amount</span><strong>{printMoney(invoice.subtotal)}</strong></div>
            <div className="ip-fin-row"><span>Carriage</span><strong>{'—'}</strong></div>
            <div className="ip-fin-row">
              <span>Tax</span>
              <strong>{invoice.tax != null ? printMoney(invoice.tax) : '—'}</strong>
            </div>
            <div className="ip-fin-row"><span>Discount</span><strong>{'—'}</strong></div>
            <div className="ip-fin-row ip-net">
              <span>Net Amount / Grand Total</span>
              <strong>{printMoney(invoice.grandTotal ?? invoice.subtotal)}</strong>
            </div>
          </div>
        </div>

        {/* ── Signatures ────────────────────────────────────────────────── */}
        <div className="ip-signatures">
          <div className="ip-signature-field">
            <div className="ip-signature-line" />
            <span>Prepared By</span>
          </div>
          <div className="ip-signature-field">
            <div className="ip-signature-line" />
            <span>Despatched By</span>
          </div>
        </div>

        {/* ── Timestamp + notes ────────────────────────────────────────── */}
        <div className="ip-time">
          Time: {new Date().toLocaleTimeString('en-US', { hour12: true }).replace(' ', '')}
        </div>

        {description && (
          <div
            className="ip-description"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

        <div className="ip-currency-note">All amounts in Indian Rupees (₹)</div>
      </div>
    </div>
  )
}