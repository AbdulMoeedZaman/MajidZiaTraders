import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { formatDateTime } from '../../../lib/format'
import type { ActionLog, ActionLogStatus, HistoryActionType } from '@shared/types/history'

const ACTION_LABELS: Record<HistoryActionType, string> = {
  product_created: 'Product created',
  restocked: 'Restocked',
  payment_recorded: 'Payment received',
  payment_reversed: 'Payment removed',
  stock_adjusted: 'Stock adjusted',
  invoice_created: 'Invoice created',
}

const STATUS_BADGE: Record<ActionLogStatus, string> = {
  applied: 'ok',
  undone: 'warn',
  superseded: 'muted-badge',
}

const STATUS_LABEL: Record<ActionLogStatus, string> = {
  applied: 'Applied',
  undone: 'Undone',
  superseded: 'Superseded',
}

export function HistoryPage() {
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  const run = async (kind: 'undo' | 'redo') => {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const log = kind === 'undo' ? await api.history.undo() : await api.history.redo()
      setMessage(`${kind === 'undo' ? 'Undid' : 'Redid'}: ${log.summary}`)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${kind}`)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const canUndo = logs.some((l) => l.status === 'applied')
  const canRedo = logs.some((l) => l.status === 'undone')

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
        <button
          className="btn ghost small"
          onClick={() => void run('undo')}
          disabled={busy || !canUndo}
        >
          Undo
        </button>
        <button
          className="btn ghost small"
          onClick={() => void run('redo')}
          disabled={busy || !canRedo}
        >
          Redo
        </button>
      </div>

      {message && <div className="form-success">{message}</div>}
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className={log.status === 'superseded' ? 'is-cancelled' : ''}>
                  <td className="fine-text">{formatDateTime(log.createdAt)}</td>
                  <td>{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td>{log.summary}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[log.status]}`}>
                      {STATUS_LABEL[log.status]}
                    </span>
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
