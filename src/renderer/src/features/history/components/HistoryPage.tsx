import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { formatDateTime } from '../../../lib/format'
import type { ActionLog, HistoryActionType } from '@shared/types/history'

const ACTION_LABELS: Record<HistoryActionType, string> = {
  product_created: 'Product created',
  restocked: 'Restocked',
  payment_recorded: 'Payment received',
  payment_reversed: 'Payment removed',
  stock_adjusted: 'Stock adjusted',
  invoice_created: 'Invoice created',
}

export function HistoryPage() {
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setLogs(await api.history.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  if (loading) {
    return (
      <div className="placeholder">
        <h3>Loading history</h3>
      </div>
    )
  }

  return (
    <div className="feature">
      <div className="toolbar">
        <div className="toolbar-title">Action log</div>
        <div className="spacer" />
        <button className="btn ghost small" onClick={() => void reload()}>
          Refresh
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {logs.length === 0 ? (
        <div className="empty-state">
          <h3>No actions recorded yet</h3>
          <p className="muted">Actions will appear here as they are performed.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="fine-text">{formatDateTime(log.createdAt)}</td>
                  <td>{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td>{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}