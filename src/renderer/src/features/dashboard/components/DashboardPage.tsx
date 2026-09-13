import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../../../lib/api'
import { formatDate, formatDateTime, formatMoney } from '../../../lib/format'
import { localDate } from '@shared/date'
import type { DashboardSummary, CashInward, CustomerOwed, TodayDispatch } from '@shared/types/dashboard'
import type { ExpenseDaySummary } from '@shared/types/expense'
import type { InvoiceWithCustomer } from '@shared/types/invoice'
import type { ActionLog } from '@shared/types/history'
import type { AppView } from '../../../components/layout/nav'
import { StatusBadge } from '../../../components/StatusBadge'

type DetailKind = 'profit' | 'stock' | 'invoices' | 'expenses' | 'owed' | 'cashflow'

interface Props {
  onNavigate: (view: AppView) => void
}

function monthStartISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function DashboardPage({ onNavigate }: Props) {
  const [start, setStart] = useState(monthStartISO(new Date()))
  const [end, setEnd] = useState(() => localDate(new Date()))
  const [detail, setDetail] = useState<DetailKind | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [activity, setActivity] = useState<ActionLog[]>([])
  const [activityMessage, setActivityMessage] = useState<string | null>(null)
  const [activityBusy, setActivityBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!start || !end || start > end) return
      setLoading(true)
      setError(null)
      try {
        const [s, recent] = await Promise.all([
          api.dashboard.summary(start, end),
          api.history.recent(8),
        ])
        if (!cancelled) {
          setSummary(s)
          setActivity(recent)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [start, end])

  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetail(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail])

  const runHistory = async (kind: 'undo' | 'redo') => {
    setActivityBusy(true)
    setActivityMessage(null)
    try {
      const log = kind === 'undo' ? await api.history.undo() : await api.history.redo()
      setActivityMessage(`✓ ${kind === 'undo' ? 'Undid' : 'Redid'}: ${log.summary}`)
      const [s, recent] = await Promise.all([
        api.dashboard.summary(start, end),
        api.history.recent(8),
      ])
      setSummary(s)
      setActivity(recent)
    } catch (e) {
      setActivityMessage(
        e instanceof Error ? e.message : `Failed to ${kind} the last action`
      )
    } finally {
      setActivityBusy(false)
    }
  }

  const toggleDetail = (kind: DetailKind) =>
    setDetail((current) => (current === kind ? null : kind))

  if (loading && !summary) {
    return (
      <div className="placeholder">
        <h3>Loading dashboard…</h3>
      </div>
    )
  }
  if (error && !summary) return <div className="error-screen">{error}</div>
  if (!summary) return <div className="error-screen">{error ?? 'No data'}</div>

  const cashNet = summary.cashFlow.inward.total - summary.cashFlow.outward.total

  return (
    <div className="feature dashboard">
      <div className="toolbar dashboard-toolbar">
        <label className="field date-field">
          <span>From</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field date-field">
          <span>To</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        {error && <span className="form-error dashboard-error">{error}</span>}
      </div>

      {start > end ? (
        <div className="empty-state">
          <h3>Invalid date range</h3>
          <p>The "To" date cannot be earlier than the "From" date.</p>
        </div>
      ) : (
        <>
          <div className="metrics">
            <MetricCard
              open={detail === 'profit'}
              label="Profit"
              value={formatMoney(summary.profit.total)}
              hint={`${summary.profit.perCustomer.length} customer${summary.profit.perCustomer.length === 1 ? '' : 's'} in range`}
              onClick={() => toggleDetail('profit')}
            />
            <MetricCard
              open={detail === 'stock'}
              label="Remaining stock"
              value={summary.stock.total.toLocaleString()}
              hint={`${summary.stock.perProduct.length} products tracked`}
              onClick={() => toggleDetail('stock')}
            />
            <MetricCard
              open={detail === 'invoices'}
              label="Invoices"
              value={summary.invoices.total.toLocaleString()}
              hint="inside the selected dates"
              onClick={() => toggleDetail('invoices')}
            />
            <MetricCard
              open={detail === 'expenses'}
              label="Expenses"
              value={formatMoney(summary.expenses.total)}
              hint={`Today: ${formatMoney(summary.expenses.todayTotal)} · ${summary.expenses.byDay.length} day${summary.expenses.byDay.length === 1 ? '' : 's'} in range`}
              onClick={() => toggleDetail('expenses')}
            />
            <MetricCard
              open={detail === 'owed'}
              label="Owed amount"
              value={formatMoney(summary.owed.total)}
              hint={`${summary.owed.perCustomer.length} customer${summary.owed.perCustomer.length === 1 ? '' : 's'} owe`}
              onClick={() => toggleDetail('owed')}
            />
            <MetricCard
              open={detail === 'cashflow'}
              label="Cash flow"
              value={formatMoney(cashNet)}
              hint={`In: ${formatMoney(summary.cashFlow.inward.total)} · Out: ${formatMoney(summary.cashFlow.outward.total)}`}
              onClick={() => toggleDetail('cashflow')}
            />
          </div>

          {detail === 'profit' && (
            <ProfitModal
              data={summary.profit.perCustomer}
              range={summary.range}
              onClose={() => setDetail(null)}
            />
          )}
          {detail === 'stock' && (
            <StockModal
              perProduct={summary.stock.perProduct}
              dispatchedToday={summary.invoices.dispatchedToday}
              onClose={() => setDetail(null)}
            />
          )}
          {detail === 'invoices' && (
            <InvoiceLedgerModal
              data={summary.invoices.list}
              range={summary.range}
              onClose={() => setDetail(null)}
            />
          )}
          {detail === 'expenses' && (
            <ExpenseDetailModal
              data={summary.expenses.byDay}
              todayTotal={summary.expenses.todayTotal}
              range={summary.range}
              onClose={() => setDetail(null)}
            />
          )}
          {detail === 'owed' && (
            <OwedModal data={summary.owed.perCustomer} onClose={() => setDetail(null)} />
          )}
          {detail === 'cashflow' && (
            <CashFlowModal
              inward={summary.cashFlow.inward.payments}
              inwardTotal={summary.cashFlow.inward.total}
              outward={summary.cashFlow.outward.expenses}
              outwardTotal={summary.cashFlow.outward.total}
              range={summary.range}
              onClose={() => setDetail(null)}
            />
          )}

          {activityMessage && (
            <div className={activityMessage.startsWith('✓') ? 'form-success' : 'form-error'}>
              {activityMessage}
            </div>
          )}

          <div className="short-lists">
            <ShortList
              title="Products"
              onMore={() => onNavigate('products')}
              empty="No products yet."
              itemsCount={summary.recent.products.length}
            >
              {summary.recent.products.map((p) => (
                <li key={p.id}>
                  <span className="short-list-name">{p.name}</span>
                  <span className="num mono">{formatMoney(p.rate)}</span>
                </li>
              ))}
            </ShortList>
            <ShortList
              title="Invoices"
              onMore={() => onNavigate('invoices')}
              empty="No invoices yet."
              itemsCount={summary.recent.invoices.length}
            >
              {summary.recent.invoices.map((inv) => (
                <li key={inv.id}>
                  <span className="short-list-name">
                    <span className="mono">{inv.invoiceNumber}</span>
                    <span className="muted fine-text"> · {inv.customerName}</span>
                  </span>
                  <span className="num mono">{formatMoney(inv.grandTotal)}</span>
                </li>
              ))}
            </ShortList>
            <ShortList
              title="Customers"
              onMore={() => onNavigate('customers')}
              empty="No customers yet."
              itemsCount={summary.recent.customers.length}
            >
              {summary.recent.customers.map((c) => (
                <li key={c.id}>
                  <span className="short-list-name">
                    {c.shopName || c.ownerName}
                    <span className="muted fine-text"> · {c.routeName}</span>
                  </span>
                  <span className="mono fine-text">{c.code}</span>
                </li>
              ))}
            </ShortList>
            <ActivityList
              logs={activity}
              busy={activityBusy}
              onUndo={() => void runHistory('undo')}
              onRedo={() => void runHistory('redo')}
              onMore={() => onNavigate('history')}
            />
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
  open,
  onClick,
}: {
  label: string
  value: string
  hint: string
  open: boolean
  onClick: () => void
}) {
  return (
    <button className={`metric-card${open ? ' open' : ''}`} onClick={onClick}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      <span className="metric-hint">{hint}</span>
    </button>
  )
}

function rangeLabel(range: { start: string; end: string }): string {
  return `${formatDate(range.start)} → ${formatDate(range.end)}`
}

function DetailModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="detail-modal-title">
            <h3>{title}</h3>
            {subtitle && <span className="muted fine-text">{subtitle}</span>}
          </div>
          <button className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="muted fine-text modal-empty">{text}</p>
}

function ProfitModal({
  data,
  range,
  onClose,
}: {
  data: DashboardSummary['profit']['perCustomer']
  range: { start: string; end: string }
  onClose: () => void
}) {
  const invoices = data.reduce((sum, c) => sum + c.invoices, 0)
  const sales = data.reduce((sum, c) => sum + c.sales, 0)
  const profit = data.reduce((sum, c) => sum + c.profit, 0)
  return (
    <DetailModal title="Profit by customer" subtitle={rangeLabel(range)} onClose={onClose}>
      {data.length === 0 ? (
        <EmptyMessage text="No profit in this period." />
      ) : (
        <div className="table-wrap modal-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="num">Invoices</th>
                <th className="num">Sales</th>
                <th className="num">Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.customerId}>
                  <td>{c.customerName}</td>
                  <td className="num">{c.invoices}</td>
                  <td className="num mono">{formatMoney(c.sales)}</td>
                  <td className="num mono">{formatMoney(c.profit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="modal-total-row">
                <td>Total</td>
                <td className="num">{invoices}</td>
                <td className="num mono">{formatMoney(sales)}</td>
                <td className="num mono">{formatMoney(profit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </DetailModal>
  )
}

function StockModal({
  perProduct,
  dispatchedToday,
  onClose,
}: {
  perProduct: DashboardSummary['stock']['perProduct']
  dispatchedToday: TodayDispatch[]
  onClose: () => void
}) {
  const total = perProduct.reduce((sum, p) => sum + p.remaining, 0)
  const dispatchedUnits = dispatchedToday.reduce((sum, d) => sum + d.quantity, 0)
  const dispatchedAmount = dispatchedToday.reduce((sum, d) => sum + d.amount, 0)
  return (
    <DetailModal title="Stock report" subtitle="remaining inventory" onClose={onClose}>
      <section className="modal-section">
        <h4>Remaining inventory</h4>
        {perProduct.length === 0 ? (
          <EmptyMessage text="No products tracked yet." />
        ) : (
          <div className="table-wrap modal-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {perProduct.map((p) => (
                  <tr key={p.productId}>
                    <td>{p.productName}</td>
                    <td className="num mono">{p.remaining.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="modal-total-row">
                  <td>Total</td>
                  <td className="num mono">{total.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="modal-section">
        <h4>Dispatched today</h4>
        {dispatchedToday.length === 0 ? (
          <EmptyMessage text="Nothing dispatched today yet." />
        ) : (
          <div className="table-wrap modal-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Quantity</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {dispatchedToday.map((d) => (
                  <tr key={d.productId}>
                    <td>{d.productName}</td>
                    <td className="num mono">{d.quantity.toLocaleString()}</td>
                    <td className="num mono">{formatMoney(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="modal-total-row">
                  <td>Total</td>
                  <td className="num mono">{dispatchedUnits.toLocaleString()}</td>
                  <td className="num mono">{formatMoney(dispatchedAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </DetailModal>
  )
}

function InvoiceLedgerModal({
  data,
  range,
  onClose,
}: {
  data: InvoiceWithCustomer[]
  range: { start: string; end: string }
  onClose: () => void
}) {
  const grandTotal = data.reduce((sum, i) => sum + (i.grandTotal ?? i.subtotal), 0)
  return (
    <DetailModal
      title="Invoice ledger"
      subtitle={rangeLabel(range)}
      onClose={onClose}
    >
      {data.length === 0 ? (
        <EmptyMessage text="No invoices in this period." />
      ) : (
        <div className="table-wrap modal-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="num">Grand total</th>
                <th className="num">Paid</th>
                <th className="num">Owed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((inv) => {
                const due = inv.grandTotal ?? inv.subtotal
                const owed = Math.max(0, due - inv.paidAmount)
                return (
                  <tr key={inv.id}>
                    <td className="mono">{inv.invoiceNumber}</td>
                    <td>{formatDate(inv.date)}</td>
                    <td>{inv.customerName}</td>
                    <td className="num mono">{formatMoney(due)}</td>
                    <td className="num mono">{formatMoney(inv.paidAmount)}</td>
                    <td className="num mono">{formatMoney(owed)}</td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="modal-total-row">
                <td colSpan={3}>Total</td>
                <td className="num mono">{formatMoney(grandTotal)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </DetailModal>
  )
}

function OwedModal({
  data,
  onClose,
}: {
  data: CustomerOwed[]
  onClose: () => void
}) {
  const total = data.reduce((sum, c) => sum + c.owed, 0)
  return (
    <DetailModal title="Amount owed" subtitle="all open invoices" onClose={onClose}>
      {data.length === 0 ? (
        <EmptyMessage text="No outstanding balances." />
      ) : (
        <div className="table-wrap modal-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="num">Open invoices</th>
                <th className="num">Owed</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.customerId}>
                  <td>{c.customerName}</td>
                  <td className="num">{c.openInvoices}</td>
                  <td className="num mono">{formatMoney(c.owed)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="modal-total-row">
                <td>Total</td>
                <td className="num">
                  {data.reduce((sum, c) => sum + c.openInvoices, 0)}
                </td>
                <td className="num mono">{formatMoney(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </DetailModal>
  )
}

function CashFlowModal({
  inward,
  inwardTotal,
  outward,
  outwardTotal,
  range,
  onClose,
}: {
  inward: CashInward[]
  inwardTotal: number
  outward: ExpenseDaySummary['items']
  outwardTotal: number
  range: { start: string; end: string }
  onClose: () => void
}) {
  return (
    <DetailModal title="Cash flow" subtitle={rangeLabel(range)} onClose={onClose}>
      <section className="modal-section">
        <h4>Inward — payments received</h4>
        {inward.length === 0 ? (
          <EmptyMessage text="No payments received in this period." />
        ) : (
          <div className="table-wrap modal-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inward.map((p) => (
                  <tr key={p.paymentId}>
                    <td>{formatDate(p.date)}</td>
                    <td className="mono">{p.invoiceNumber}</td>
                    <td>{p.customerName}</td>
                    <td className="num mono">{formatMoney(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="modal-total-row">
                  <td colSpan={3}>Total received</td>
                  <td className="num mono">{formatMoney(inwardTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="modal-section">
        <h4>Outward — expenses paid</h4>
        {outward.length === 0 ? (
          <EmptyMessage text="No expenses in this period." />
        ) : (
          <div className="table-wrap modal-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {outward.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.date)}</td>
                    <td>{e.name}</td>
                    <td className="num mono">{formatMoney(e.price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="modal-total-row">
                  <td colSpan={2}>Total paid</td>
                  <td className="num mono">{formatMoney(outwardTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="modal-net">
        <span>Net cash flow</span>
        <strong className="mono">{formatMoney(inwardTotal - outwardTotal)}</strong>
      </div>
    </DetailModal>
  )
}

function ShortList({
  title,
  onMore,
  empty,
  itemsCount,
  children,
}: {
  title: string
  onMore: () => void
  empty: string
  itemsCount: number
  children: ReactNode
}) {
  return (
    <section className="short-list">
      <header className="short-list-header">
        <h3>{title}</h3>
        <button className="btn ghost small" onClick={onMore}>
          More →
        </button>
      </header>
      {itemsCount === 0 ? (
        <p className="muted fine-text short-list-empty">{empty}</p>
      ) : (
        <ul className="short-list-items">{children}</ul>
      )}
    </section>
  )
}

function ActivityList({
  logs,
  busy,
  onUndo,
  onRedo,
  onMore,
}: {
  logs: ActionLog[]
  busy: boolean
  onUndo: () => void
  onRedo: () => void
  onMore: () => void
}) {
  const canUndo = logs.some((l) => l.status === 'applied')
  const canRedo = logs.some((l) => l.status === 'undone')
  return (
    <section className="short-list">
      <header className="short-list-header">
        <h3>Recent activity</h3>
        <span className="activity-actions">
          <button className="btn ghost small" onClick={onUndo} disabled={busy || !canUndo}>
            Undo
          </button>
          <button className="btn ghost small" onClick={onRedo} disabled={busy || !canRedo}>
            Redo
          </button>
          <button className="btn ghost small" onClick={onMore}>
            More →
          </button>
        </span>
      </header>
      {logs.length === 0 ? (
        <p className="muted fine-text short-list-empty">No actions recorded yet.</p>
      ) : (
        <ul className="short-list-items">
          {logs.map((log) => (
            <li key={log.id}>
              <span className="short-list-name">
                <span className={`badge ${log.status === 'applied' ? 'ok' : log.status === 'undone' ? 'warn' : 'muted-badge'}`}>
                  {log.status}
                </span>
                <span>{log.summary}</span>
              </span>
              <span className="muted fine-text">{formatDateTime(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ExpenseDetailModal({
  data,
  todayTotal,
  range,
  onClose,
}: {
  data: ExpenseDaySummary[]
  todayTotal: number
  range: { start: string; end: string }
  onClose: () => void
}) {
  const grandTotal = data.reduce((sum, day) => sum + day.total, 0)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal expense-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="detail-modal-title">
            <h3>Expenses</h3>
            <span className="muted fine-text">
              {formatDate(range.start)} → {formatDate(range.end)} · Today: {formatMoney(todayTotal)}
            </span>
          </div>
          <button className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        {data.length === 0 ? (
          <div className="empty-state">
            <h3>No expenses in this period</h3>
          </div>
        ) : (
          <div className="expense-modal-days">
            {data.map((day) => (
              <section key={day.date} className="expense-modal-day">
                <header className="expense-modal-day-header">
                  <strong>{formatDate(day.date)}</strong>
                  <span className="num mono">{formatMoney(day.total)}</span>
                </header>
                <ul className="expense-modal-item-list">
                  {day.items.map((e) => (
                    <li key={e.id}>
                      <span>{e.name}</span>
                      <span className="num mono">{formatMoney(e.price)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <footer className="expense-modal-total">
              <strong>Total</strong>
              <strong className="num mono">{formatMoney(grandTotal)}</strong>
            </footer>
          </div>
        )}
      </div>
    </div>
  )
}