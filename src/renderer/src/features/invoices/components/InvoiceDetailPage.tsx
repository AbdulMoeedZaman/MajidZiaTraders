import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { invoiceRemaining } from '@shared/types/invoice'
import type { InvoiceDetails } from '@shared/types/invoice'
import { InvoiceSheet } from './InvoiceSheet'

interface Props {
  invoiceId: number
  onBack: () => void
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

  const { invoice } = data
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

      <InvoiceSheet details={data} description={description} />
    </div>
  )
}