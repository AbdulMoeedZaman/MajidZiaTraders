import { useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import { useCustomers } from '../hooks/useCustomers'
import { CustomerForm } from './CustomerForm'
import { RouteNamesModal } from './RouteNamesModal'
import { SearchSelect } from '../../../components/SearchSelect'
import type { CustomerFormData } from './CustomerForm'
import type { CustomerWithRoute } from '@shared/types/customer'
import type { Broker } from '@shared/types/broker'

interface Props {
  onSelect: (customer: CustomerWithRoute) => void
  onNewInvoice: (customerId: number) => void
  onMultipleInvoice: (customerIds: number[], brokerId: number) => void
}

export function CustomerList({ onSelect, onNewInvoice, onMultipleInvoice }: Props) {
  const { routes, customers, activeRouteId, loading, error, setRoute, create, update, remove, reload } =
    useCustomers()
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showRouteNames, setShowRouteNames] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [editing, setEditing] = useState<CustomerWithRoute | null>(null)
  const [multiSelect, setMultiSelect] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bookerPrompt, setBookerPrompt] = useState<{ ids: number[]; brokerId: number | null; loading: boolean } | null>(null)
  const [bookers, setBookers] = useState<Broker[]>([])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.shopName.toLowerCase().includes(q) ||
        c.ownerName.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
    )
  }, [customers, query])

  const handleSave = async (data: CustomerFormData) => {
    setFormError(null)
    try {
      if (editing) {
        await update(editing.id, data)
      } else {
        await create(data)
      }
      setShowAdd(false)
      setEditing(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save customer')
      throw e
    }
  }

  const handleDelete = async (id: number) => {
    setFormError(null)
    try {
      await remove(id)
      setConfirmId(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to delete customer')
      setConfirmId(null)
    }
  }

  const handleImportExcel = async () => {
    setFormError(null)
    setImportMessage(null)
    try {
      if (activeRouteId === null) {
        setFormError('No route selected')
        return
      }
      const pick = await api.dialogs.openExcel()
      if (pick.canceled || !pick.path) return
      const route = routes.find((r) => r.id === activeRouteId)
      const result = await api.customers.importExcel(pick.path, activeRouteId)
      const parts = [
        `Imported ${result.created} customer${result.created === 1 ? '' : 's'} to ${route?.name ?? 'route'}`,
      ]
      if (result.skippedDuplicate > 0) parts.push(`${result.skippedDuplicate} skipped (code already exists)`)
      if (result.skippedInvalid > 0) parts.push(`${result.skippedInvalid} skipped (invalid rows)`)
      setImportMessage(parts.join(' · '))
      await reload()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to import Excel')
    }
  }

  const saveRouteNames = async (updates: Array<{ id: number; name: string }>) => {
    for (const u of updates) {
      await api.routes.rename(u.id, u.name)
    }
    await reload()
  }

  const enterMultiSelect = async () => {
    setMultiSelect(true)
    setSelected(new Set())
    setFormError(null)
    if (bookers.length === 0) {
      try {
        setBookers(await api.brokers.list())
      } catch {
        setBookers([])
      }
    }
  }

  const exitMultiSelect = () => {
    setMultiSelect(false)
    setSelected(new Set())
  }

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
      return new Set(visible.map((c) => c.id))
    })
  }

  const openBookerPrompt = () => {
    if (selected.size === 0) return
    setBookerPrompt({ ids: [...selected], brokerId: null, loading: false })
  }

  const confirmBookerPrompt = () => {
    if (!bookerPrompt || bookerPrompt.brokerId === null || bookerPrompt.loading) return
    setBookerPrompt({ ...bookerPrompt, loading: true })
    setMultiSelect(false)
    setSelected(new Set())
    onMultipleInvoice(bookerPrompt.ids, bookerPrompt.brokerId)
  }

  if (loading && routes.length === 0)
    return <div className="placeholder"><h3>Loading customers…</h3></div>
  if (error) return <div className="error-screen">{error}</div>

  return (
    <div className="feature">
      <div className="toolbar">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers…"
        />
        <div className="spacer" />
        <div className="icon-cluster">
          <button className="btn ghost icon" onClick={() => void reload()} title="Refresh">
            ↻
          </button>
        </div>
        {multiSelect ? (
          <>
            <button className="btn ghost" onClick={exitMultiSelect} disabled={!multiSelect}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={selected.size === 0}
              onClick={openBookerPrompt}
            >
              {selected.size > 0 ? 'Confirm, Create Invoice' : 'Multiple Invoice'}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={() => void enterMultiSelect()} disabled={routes.length === 0}>
              Multiple Invoice
            </button>
            <button className="btn ghost" onClick={() => setShowRouteNames(true)} title="Set or edit the name of each delivery day's route">
              Route names
            </button>
            <button className="btn primary" onClick={() => setShowAdd(true)} disabled={routes.length === 0}>
              + Add Customer
            </button>
            <button className="btn ghost" onClick={() => void handleImportExcel()} disabled={routes.length === 0}>
              Import Excel…
            </button>
          </>
        )}
      </div>

      <div className="route-tabs">
        {routes.map((r) => (
          <button
            key={r.id}
            className={r.id === activeRouteId ? 'active' : ''}
            onClick={() => void setRoute(r.id)}
          >
            {r.name}
            <span className="route-count">{r.customerCount}</span>
          </button>
        ))}
      </div>

      {formError && <div className="form-error">{formError}</div>}
      {importMessage && <div className="text-ok fine-text">{importMessage}</div>}

      {customers.length === 0 ? (
        <div className="empty-state">
          <h3>No customers on this route</h3>
          <p>Add a customer to start invoicing this route.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {multiSelect && (
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
                <th>Code</th>
                <th>Shop</th>
                <th>Owner</th>
                <th>Phone</th>
                {!multiSelect && <th className="actions-col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr
                  key={c.id}
                  className={selected.has(c.id) ? 'selected' : ''}
                  onClick={() => (multiSelect ? toggle(c.id) : onSelect(c))}
                >
                  {multiSelect && (
                    <td className="select-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                      />
                    </td>
                  )}
                  <td className="mono">{c.code}</td>
                  <td>{c.shopName || '—'}</td>
                  <td>{c.ownerName || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  {!multiSelect && (
                    <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                      {confirmId === c.id ? (
                        <span className="confirm-bar">
                          <button
                            className="btn danger small"
                            onClick={() => void handleDelete(c.id)}
                          >
                            Confirm
                          </button>
                          <button className="btn ghost small" onClick={() => setConfirmId(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <>
                          <button className="btn ghost small" onClick={() => onNewInvoice(c.id)}>
                            New Invoice
                          </button>
                          <button className="btn ghost small" onClick={() => setEditing(c)}>
                            Edit
                          </button>
                          <button className="btn danger small" onClick={() => setConfirmId(c.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && activeRouteId !== null && (
        <CustomerForm
          routes={routes}
          initialRouteId={editing?.routeId ?? activeRouteId}
          initial={editing}
          onSave={handleSave}
          onCancel={() => {
            setShowAdd(false)
            setEditing(null)
          }}
        />
      )}

      {showRouteNames && (
        <RouteNamesModal
          routes={routes}
          onSave={saveRouteNames}
          onCancel={() => setShowRouteNames(false)}
        />
      )}

      {bookerPrompt && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Create multiple invoices</h3>
            </div>
            <p className="fine-text muted" style={{ marginTop: 0 }}>
              {bookerPrompt.ids.length} customer{bookerPrompt.ids.length === 1 ? '' : 's'} selected.
              Pick a single booker that will be applied to the entire sequence.
            </p>
            <div className="field">
              <span>Booker</span>
              <SearchSelect
                options={bookers.map((b) => ({ value: b.id, label: b.name }))}
                value={bookerPrompt.brokerId}
                onChange={(brokerId) =>
                  setBookerPrompt((prev) => (prev ? { ...prev, brokerId } : prev))
                }
                placeholder="Select booker…"
              />
            </div>
            <div className="form-actions">
              <button
                className="btn ghost"
                onClick={() => setBookerPrompt(null)}
                disabled={bookerPrompt.loading}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={bookerPrompt.brokerId === null || bookerPrompt.loading}
                onClick={confirmBookerPrompt}
              >
                {bookerPrompt.loading ? 'Starting…' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}