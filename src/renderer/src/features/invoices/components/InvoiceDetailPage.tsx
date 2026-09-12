import { useCallback, useEffect, useState } from 'react'
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
  return ((cents ?? 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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

  return (
    <div className="feature">
      <div className="toolbar">
        <button className="btn ghost" onClick={onBack}>
          ← Back
        </button>
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
        {owner && (
          <>
            <div className="ip-owner">{owner.name}</div>
            <div className="ip-band">
              <div className="ip-phone">{owner.phone || ''}</div>
              <div className="ip-address">{owner.address || ''}</div>
            </div>
          </>
        )}

        <div className="ip-details">
          <div className="ip-customer">
            {customer && (
              <>
                <div>Shop name: <strong>{customer.shopName}</strong></div>
                <div>Owner name: <strong>{customer.ownerName}</strong></div>
                <div>Phone: {customer.phone}</div>
                <div>Address: {customer.address}</div>
                <div>
                  Status: {invoice.filerStatus === 'filer' ? 'Filer' : 'Non Filer'}
                </div>
              </>
            )}
          </div>
          <div className="ip-right">
            <div>Date: {printDate(invoice.date)}</div>
            {broker && (
              <>
                <div>Booker: {broker.name}</div>
                <div>Phone: {broker.phone}</div>
              </>
            )}
            <div>Invoice No: <strong>{invoice.invoiceNumber}</strong></div>
          </div>
        </div>

        <table className="ip-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Rate</th>
              <th>Carton no</th>
              <th>Box no</th>
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
                <td className="ip-scheme"></td>
                <td className="ip-num">{printMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ip-total-row">
              <td colSpan={5} className="ip-total-label">
                Total / Subtotal
              </td>
              <td className="ip-num">{printMoney(invoice.subtotal)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="ip-totals">
          <div className="ip-totals-row">
            <span>Remaining amount</span>
            <strong>{printMoney(invoice.remaining)}</strong>
          </div>
          <div className="ip-totals-row">
            <span>Tax</span>
            <strong>{printMoney(invoice.tax)}</strong>
          </div>
          <div className="ip-totals-row ip-grand">
            <span>Grand total</span>
            <strong>{printMoney(invoice.grandTotal)}</strong>
          </div>
        </div>

        <div className="ip-signature">
          <div className="ip-signature-line"></div>
          <span>Signature</span>
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