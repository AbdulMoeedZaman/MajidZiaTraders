import { useEffect, useState } from 'react'
import type { StockMovementWithContext } from '@shared/types/inventory'
import { api } from '../../../lib/api'
import { formatDateTime } from '../../../lib/format'
import { STOCK_MOVEMENT_LABELS } from '../types/product-form'

interface StockHistoryModalProps {
  productId: number
  productName: string
  onClose: () => void
}

function referenceText(m: StockMovementWithContext): string {
  if (m.referenceType === 'invoice' && m.invoiceNumber) return `Invoice ${m.invoiceNumber}`
  if (m.referenceType === 'invoice' && m.customerName) return `Invoice ${m.customerName}`
  if (m.referenceType === 'restock' && m.supplierName) return `Add stock · ${m.supplierName}`
  return m.reason ?? '—'
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  restock: 'badge ok',
  sale: 'badge danger',
  return: 'badge warn',
  damage: 'badge warn',
}

export function StockHistoryModal({ productId, productName, onClose }: StockHistoryModalProps) {
  const [movements, setMovements] = useState<StockMovementWithContext[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.inventory
      .listMovementsWithContext(productId)
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
                <td>
                  <span className={TYPE_BADGE_CLASS[m.type] ?? 'badge muted-badge'}>
                    {STOCK_MOVEMENT_LABELS[m.type] ?? m.type}
                  </span>
                </td>
                <td className={`num ${m.quantity < 0 ? 'text-danger' : 'text-ok'}`}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </td>
                <td className="num">{m.newQuantity}</td>
                <td>{referenceText(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}