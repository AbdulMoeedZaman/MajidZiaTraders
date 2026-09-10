import { useCallback, useEffect, useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { RestockListItem, CreateRestockDTO } from '@shared/types/restock'
import { api } from '../../../lib/api'
import { useRestocks } from '../hooks/useRestocks'
import { createCsvExport } from '../../../lib/csv'
import { RestockForm } from './RestockForm'
import { RESTOCK_STATUS_LABELS, RestockFilter } from '../types/restock-form'
import { formatDate, formatMoney } from '../../../lib/format'

interface RestockListProps {
  onSelect: (restock: RestockListItem) => void
}

export function RestockList({ onSelect }: RestockListProps) {
  const {
    visible,
    loading,
    error,
    filter,
    setFilter,
    query,
    setQuery,
    createRestock,
  } = useRestocks()

  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    api.products
      .listActiveWithStock()
      .then(setProducts)
      .catch(() => setProducts([]))
  }, [])

  const handleFormSubmit = useCallback(
    async (payload: CreateRestockDTO): Promise<string | null> => {
      const err = await createRestock(payload)
      if (!err) setFormOpen(false)
      return err
    },
    [createRestock]
  )

  const handleExport = async () => {
    const result = await api.dialogs.saveFile({ defaultPath: 'restocks.csv' })
    if (result.canceled || !result.filePath) return
    try {
      await createCsvExport({
        entityType: 'restocks',
        filePath: result.filePath,
        columns: ['referenceNumber', 'supplierName', 'date', 'totalCost', 'status', 'notes'],
        filters: filter !== 'all' ? { status: filter } : {},
      })
      setActionError(null)
    } catch (e) {
      setActionError(String(e))
    }
  }

  return (
    <div className="feature">
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search by reference or supplier…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="segmented">
          {(['all', 'pending', 'received', 'cancelled'] as RestockFilter[]).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={handleExport} disabled={visible.length === 0}>
          Export CSV
        </button>
        <button className="btn primary" onClick={() => setFormOpen(true)}>
          + New restock
        </button>
      </div>

      {actionError && <div className="form-error">{actionError}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : error ? (
        <div className="form-error">{error}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Supplier</th>
                <th>Date</th>
                <th className="num">Items</th>
                <th className="num">Total cost</th>
                <th>Status</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No restocks found.
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr key={r.id} onClick={() => onSelect(r)}>
                  <td className="mono">{r.referenceNumber}</td>
                  <td>{r.supplierName}</td>
                  <td>{formatDate(r.date)}</td>
                  <td className="num">{r.itemCount}</td>
                  <td className="num">{formatMoney(r.totalCost)}</td>
                  <td>
                    <span
                      className={`badge ${
                        r.status === 'received' ? 'ok' : r.status === 'cancelled' ? 'danger' : 'warn'
                      }`}
                    >
                      {RESTOCK_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                    <button className="btn small" onClick={() => onSelect(r)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <Modal title="New restock" onClose={() => setFormOpen(false)}>
          <RestockForm products={products} onSubmit={handleFormSubmit} onCancel={() => setFormOpen(false)} />
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