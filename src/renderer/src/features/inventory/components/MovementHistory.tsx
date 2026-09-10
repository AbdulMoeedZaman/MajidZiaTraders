import { useEffect, useState } from 'react'
import type { StockMovement } from '@shared/types/inventory'
import { api } from '../../../lib/api'
import { formatDateTime } from '../../../lib/format'
import { STOCK_MOVEMENT_LABELS } from '../../products/types/product-form'

interface MovementHistoryProps {
  productId: number
  productName: string
  onClose: () => void
}

export function MovementHistory({ productId, productName, onClose }: MovementHistoryProps) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.inventory
      .listMovements(productId)
      .then((rows) => {
        if (!cancelled) setMovements(rows)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [productId])

  return (
    <div className="history">
      <div className="detail-header">
        <div>
          <h3>Stock history</h3>
          <span className="muted">{productName}</span>
        </div>
        <button className="btn ghost icon" onClick={onClose} aria-label="Close" title="Close">
          ✕
        </button>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : error ? (
        <div className="form-error">{error}</div>
      ) : movements.length === 0 ? (
        <div className="muted">No stock movements recorded yet.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th className="num">Qty</th>
              <th className="num">Balance</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{formatDateTime(m.createdAt)}</td>
                <td>{STOCK_MOVEMENT_LABELS[m.type] ?? m.type}</td>
                <td className={`num ${m.quantity < 0 ? 'text-danger' : 'text-ok'}`}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </td>
                <td className="num">{m.newQuantity}</td>
                <td>{m.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}