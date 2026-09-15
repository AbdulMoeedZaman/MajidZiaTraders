import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { formatDate, formatMoney } from '../../../lib/format'
import { localDate } from '@shared/date'
import { moneyToCents } from '../../../lib/money'
import type { ExpenseDaySummary } from '@shared/types/expense'

export function ExpensePage() {
  const [date, setDate] = useState(() => localDate(new Date()))
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [summary, setSummary] = useState<ExpenseDaySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const reload = useCallback(async (targetDate: string) => {
    setLoading(true)
    setError(null)
    try {
      const s = await api.expenses.daySummary(targetDate)
      setSummary(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload(date)
  }, [date, reload])

  const handleAdd = async () => {
    setError(null)
    setSuccess(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Expense name is required')
      return
    }
    const cents = moneyToCents(price)
    if (cents <= 0) {
      setError('Enter a price greater than zero')
      return
    }
    const exists = summary?.items.some((e) => e.name === trimmed) ?? false
    try {
      await api.expenses.save({ date, name: trimmed, price: cents })
      setSuccess(exists ? `Updated "${trimmed}" for ${formatDate(date)}` : `Added "${trimmed}"`)
      setName('')
      setPrice('')
      await reload(date)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save expense')
    }
  }

  const handleDelete = async (id: number) => {
    setError(null)
    setSuccess(null)
    try {
      await api.expenses.remove(id)
      setConfirmId(null)
      await reload(date)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete expense')
      setConfirmId(null)
    }
  }

  const isLoading = loading && !summary

  return (
    <div className="feature">
      <div className="toolbar">
        <label className="field date-field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="spacer" />
        <button className="btn ghost icon" onClick={() => void reload(date)} title="Refresh">
          ↻
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="text-ok fine-text">{success}</div>}

      <section className="expense-summary">
        <div className="expense-summary-copy">
          <h3>{isLoading ? 'Expenses' : `Expenses for ${formatDate(date)}`}</h3>
          <span className="muted fine-text">Total expense for the day</span>
        </div>
        <div className="expense-summary-total">{formatMoney(summary?.total ?? 0)}</div>
      </section>

      {isLoading ? (
        <div className="placeholder">
          <h3>Loading expenses…</h3>
        </div>
      ) : (
        <>
          <form
            className="expense-form"
            onSubmit={(e) => {
              e.preventDefault()
              void handleAdd()
            }}
          >
            <label className="field expense-name">
              <span>Expense name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Travelling"
              />
            </label>
            <label className="field expense-price">
              <span>Price (Rs.)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
              />
            </label>
            <button className="btn primary" type="submit">
              + Add Expense
            </button>
          </form>

          {summary && summary.items.length === 0 ? (
            <div className="empty-state">
              <h3>No expenses for this day</h3>
              <p>Add the day's expenses above — each entry is saved against {formatDate(date)}.</p>
            </div>
          ) : (
            summary && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Expense</th>
                      <th className="num">Price</th>
                      <th className="actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.items.map((e) => (
                      <tr key={e.id}>
                        <td>{e.name}</td>
                        <td className="num mono">{formatMoney(e.price)}</td>
                        <td className="actions-col" onClick={(ev) => ev.stopPropagation()}>
                          {confirmId === e.id ? (
                            <span className="confirm-bar">
                              <button
                                className="btn danger small"
                                onClick={() => void handleDelete(e.id)}
                              >
                                Confirm
                              </button>
                              <button className="btn ghost small" onClick={() => setConfirmId(null)}>
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button className="btn danger small" onClick={() => setConfirmId(e.id)}>
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="expense-total-row">
                      <th>Total</th>
                      <th className="num mono">{formatMoney(summary.total)}</th>
                      <th />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}