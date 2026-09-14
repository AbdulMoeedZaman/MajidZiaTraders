import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import { formatDate, formatMoney } from '../../../lib/format'
import { LoadFormReport } from './LoadFormReport'
import { StatusBadge } from '../../../components/StatusBadge'
import { localDate } from '@shared/date'
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
  const [from, setFrom] = useState(() => localDate(new Date()))
  const [to, setTo] = useState(() => localDate(new Date()))
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loadForm, setLoadForm] = useState<LoadFormSummary | null>(null)
  const [loadFormIds, setLoadFormIds] = useState<number[]>([])
  const [loadFormError, setLoadFormError] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)

  const load = async () => {
    if (!from || !to || from > to) return
    setLoading(true)
    setError(null)
    try {
      setInvoices(await api.invoices.listByDate(from, to))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [from, to])

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

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === visible.length) return new Set<number>()
      return new Set(visible.map((inv) => inv.id))
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
      const ids = [...selected]
      const summary = await api.invoices.buildLoadForm(ids)
      setLoadForm(summary)
      setLoadFormIds(ids)
      setSelectMode(false)
      setSelected(new Set())
    } catch (e) {
      setLoadFormError(e instanceof Error ? e.message : 'Failed to build load form')
    } finally {
      setBuilding(false)
    }
  }

  const closeReport = () => {
    setLoadForm(null)
    setLoadFormIds([])
  }

  if (loadForm) {
    return <LoadFormReport summary={loadForm} invoiceIds={loadFormIds} onClose={closeReport} />
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
        <label className="field date-field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field date-field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
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

      {from > to ? (
        <div className="empty-state">
          <h3>Invalid date range</h3>
          <p>The "To" date cannot be earlier than the "From" date.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <h3>No invoices in this period</h3>
          <p>Change the date range to see more invoices.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {selectMode && (
                  <th className="select-col">
                    <input
                      type="checkbox"
                      checked={visible.length > 0 && selected.size === visible.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selected.size > 0 && selected.size < visible.length
                      }}
                      onChange={toggleAll}
                    />
                  </th>
                )}
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