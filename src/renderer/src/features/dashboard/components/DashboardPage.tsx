import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../../../lib/api'
import { formatDate, formatMoney } from '../../../lib/format'
import { localDate } from '@shared/date'
import type { DashboardSummary, CustomerProfit, ProductRemaining } from '@shared/types/dashboard'
import type { ExpenseDaySummary } from '@shared/types/expense'
import type { InvoiceWithCustomer } from '@shared/types/invoice'
import type { AppView } from '../../../components/layout/nav'

type DetailKind = 'profit' | 'stock' | 'invoices' | 'expenses'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!start || !end || start > end) return
      setLoading(true)
      setError(null)
      try {
        const s = await api.dashboard.summary(start, end)
        if (!cancelled) setSummary(s)
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
              label="Invoices created"
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
          </div>

          {detail === 'profit' && <ProfitDetail data={summary.profit.perCustomer} range={summary.range} onClose={() => setDetail(null)} />}
          {detail === 'stock' && <StockDetail data={summary.stock.perProduct} onClose={() => setDetail(null)} />}
          {detail === 'invoices' && <InvoiceDetail data={summary.invoices.list} range={summary.range} onClose={() => setDetail(null)} />}
          {detail === 'expenses' && (
            <ExpenseDetailModal
              data={summary.expenses.byDay}
              todayTotal={summary.expenses.todayTotal}
              range={summary.range}
              onClose={() => setDetail(null)}
            />
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

function DetailShell({
  title,
  range,
  onClose,
  children,
}: {
  title: string
  range?: { start: string; end: string }
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="detail-panel">
      <div className="detail-header">
        <h3>{title}</h3>
        <span className="muted fine-text">
          {range ? `${formatDate(range.start)} → ${formatDate(range.end)}` : ''}
        </span>
        <div className="spacer" />
        <button className="btn ghost small" onClick={onClose}>
          Close
        </button>
      </div>
      {children}
    </div>
  )
}

function EmptyDetail({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <h3>{message}</h3>
    </div>
  )
}

function ProfitDetail({
  data,
  range,
  onClose,
}: {
  data: CustomerProfit[]
  range: { start: string; end: string }
  onClose: () => void
}) {
  return (
    <DetailShell title="Profit by customer" range={range} onClose={onClose}>
      {data.length === 0 ? (
        <EmptyDetail message="No profit in this period" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="num">Invoices</th>
                <th className="num">Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.customerId}>
                  <td>{c.customerName}</td>
                  <td className="num">{c.invoices}</td>
                  <td className="num mono">{formatMoney(c.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DetailShell>
  )
}

function StockDetail({
  data,
  onClose,
}: {
  data: ProductRemaining[]
  onClose: () => void
}) {
  return (
    <DetailShell title="Remaining stock by product" onClose={onClose}>
      {data.length === 0 ? (
        <EmptyDetail message="No products tracked yet" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.productId}>
                  <td>{p.productName}</td>
                  <td className="num">{p.remaining.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DetailShell>
  )
}

function InvoiceDetail({
  data,
  range,
  onClose,
}: {
  data: InvoiceWithCustomer[]
  range: { start: string; end: string }
  onClose: () => void
}) {
  return (
    <DetailShell title="Invoices in range" range={range} onClose={onClose}>
      {data.length === 0 ? (
        <EmptyDetail message="No invoices in this period" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice no.</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="num">Grand total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td>{inv.customerName}</td>
                  <td className="num mono">{formatMoney(inv.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DetailShell>
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
          <div>
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