import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import { formatDate, formatMoney } from '../../../lib/format'
import { LoadFormReport } from './LoadFormReport'
import { StatusBadge } from '../../../components/StatusBadge'
import type { InvoiceWithCustomer, LoadFormSummary } from '@shared/types/invoice'

interface Props {
  onOpen: (invoiceId: number) => void
  onNewInvoice: () => void
}

export function InvoiceList({ onOpen, onNewInvoice }: Props) {
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loadForm, setLoadForm] = useState<LoadFormSummary | null>(null)
  const [loadFormError, setLoadFormError] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setInvoices(await api.invoices.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.customerCode.toLowerCase().includes(q)
    )
  }, [invoices, query])

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const enterSelectMode = () => {
    setSelected(new Set())
    setSelectMode(true)
    setLoadFormError(null)
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
    setLoadFormError(null)
  }

  const buildReport = async () => {
    if (selected.size === 0) return
    setBuilding(true)
    setLoadFormError(null)
    try {
      const summary = await api.invoices.buildLoadForm([...selected])
      setLoadForm(summary)
      setSelectMode(false)
      setSelected(new Set())
    } catch (e) {
      setLoadFormError(e instanceof Error ? e.message : 'Failed to build load form')
    } finally {
      setBuilding(false)
    }
  }

  const closeReport = () => setLoadForm(null)

  if (loadForm) {
    return <LoadFormReport summary={loadForm} onClose={closeReport} />
  }

  if (loading) return <div className="placeholder"><h3>Loading invoices…</h3></div>
  if (error) return <div className="error-screen">{error}</div>

  return (
    <div className="feature">
      <div className="toolbar">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by number or customer…"
        />
        <div className="spacer" />
        <div className="icon-cluster">
          <button className="btn ghost icon" onClick={() => void load()} title="Refresh">
            ↻
          </button>
        </div>
        {selectMode ? (
          <>
            <button className="btn ghost" onClick={exitSelectMode}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={selected.size === 0 || building}
              onClick={() => void buildReport()}
            >
              {building ? 'Building…' : 'Create Load Form'}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={enterSelectMode}>
              Load form
            </button>
            <button className="btn primary" onClick={onNewInvoice}>
              + New Invoice
            </button>
          </>
        )}
      </div>

      {loadFormError && <div className="form-error">{loadFormError}</div>}

      {visible.length === 0 ? (
        <div className="empty-state">
          <h3>No invoices yet</h3>
          <p>Create your first invoice to get started.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {selectMode && <th className="select-col"></th>}
                <th>Invoice no.</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="num">Subtotal</th>
                <th className="num">Grand total</th>
                {!selectMode && <th className="actions-col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => (
                <tr
                  key={inv.id}
                  className={`${inv.status === 'cancelled' ? 'is-cancelled' : ''} ${selected.has(inv.id) ? 'selected' : ''}`}
                  onClick={() => (selectMode ? toggle(inv.id) : onOpen(inv.id))}
                >
                  {selectMode && (
                    <td className="select-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(inv.id)}
                        onChange={() => toggle(inv.id)}
                      />
                    </td>
                  )}
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td>
                    {inv.customerName}
                    <span className="muted fine-text"> · {inv.customerCode}</span>
                  </td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="num mono">{formatMoney(inv.subtotal)}</td>
                  <td className="num mono">{formatMoney(inv.grandTotal)}</td>
                  {!selectMode && (
                    <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                      <button className="btn ghost small" onClick={() => onOpen(inv.id)}>
                        View
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}