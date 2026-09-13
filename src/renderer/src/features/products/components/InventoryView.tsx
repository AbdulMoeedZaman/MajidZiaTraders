import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { formatMoney, formatStockDate } from '../../../lib/format'
import { exportReportCsv, printReport, type ReportSection } from '../../../lib/report'
import type { StockMovementWithProduct } from '@shared/types/stock'

interface Props {
  onBack: () => void
}

export function InventoryView({ onBack }: Props) {
  const [movements, setMovements] = useState<StockMovementWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setMovements(await api.stock.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sections: ReportSection[] = [
    {
      title: 'Inventory',
      columns: ['Product', 'Date', 'Customer', 'Price', 'Quantity'],
      rows: movements.map((m) => [
        m.productName,
        formatStockDate(m.date),
        m.customerName ?? '—',
        m.price != null ? formatMoney(m.price) : '—',
        m.type === 'purchase' ? `+${m.quantity} Restocks` : String(m.quantity),
      ]),
    },
  ]

  return (
    <div className="feature">
      <div className="toolbar">
        <div className="spacer" />
        <div className="icon-cluster">
          <button className="btn ghost icon" onClick={() => void load()} title="Refresh">
            ↻
          </button>
        </div>
        <button
          className="btn ghost"
          onClick={() => printReport('Inventory', 'all stock movements', sections)}
        >
          Print
        </button>
        <button className="btn ghost" onClick={() => exportReportCsv('Inventory', sections)}>
          Export CSV
        </button>
        <button className="btn ghost" onClick={onBack}>
          Back to Products
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="section-title">Inventory</div>

      {loading ? (
        <div className="placeholder">
          <h3>Loading inventory…</h3>
        </div>
      ) : movements.length === 0 ? (
        <div className="empty-state">
          <h3>No stock movements yet</h3>
          <p>Restock a product to record a stock entry.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="num">Price</th>
                <th className="num">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.productName}</td>
                  <td>{formatStockDate(m.date)}</td>
                  <td>{m.customerName ?? '—'}</td>
                  <td className="num mono">{m.price != null ? formatMoney(m.price) : '—'}</td>
                  <td className="num">
                    {m.type === 'purchase' ? (
                      <span className="stock-in">+{m.quantity} Restocks</span>
                    ) : (
                      <span className="stock-out">{m.quantity}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}