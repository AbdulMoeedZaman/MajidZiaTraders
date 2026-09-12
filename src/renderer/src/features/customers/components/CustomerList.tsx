import { useMemo, useState } from 'react'
import { useCustomers } from '../hooks/useCustomers'
import { CustomerForm } from './CustomerForm'
import type { CustomerFormData } from './CustomerForm'
import type { CustomerWithRoute } from '@shared/types/customer'

interface Props {
  onSelect: (customer: CustomerWithRoute) => void
  onNewInvoice: (customerId: number) => void
}

export function CustomerList({ onSelect, onNewInvoice }: Props) {
  const { routes, customers, activeRouteId, loading, error, setRoute, create, remove, reload } =
    useCustomers()
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

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
      await create(data)
      setShowAdd(false)
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
        <button className="btn primary" onClick={() => setShowAdd(true)} disabled={routes.length === 0}>
          + Add Customer
        </button>
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
                <th>Code</th>
                <th>Shop</th>
                <th>Owner</th>
                <th>Phone</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} onClick={() => onSelect(c)}>
                  <td className="mono">{c.code}</td>
                  <td>{c.shopName || '—'}</td>
                  <td>{c.ownerName || '—'}</td>
                  <td>{c.phone || '—'}</td>
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
                        <button className="btn danger small" onClick={() => setConfirmId(c.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && activeRouteId !== null && (
        <CustomerForm
          routes={routes}
          initialRouteId={activeRouteId}
          onSave={handleSave}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}