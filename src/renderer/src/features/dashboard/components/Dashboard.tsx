import { useDashboard } from '../hooks/useDashboard'
import { formatDate, formatMoney } from '../../../lib/format'
import { INVOICE_STATUS_LABELS } from '../../invoices/types/invoice-form'
import { statusBadgeTone } from '../../invoices/components/InvoiceList'
import { ReportsSection } from './ReportsSection'

interface DashboardProps {
  onOpenInvoice: (id: number) => void
  onOpenPayments: () => void
}

export function Dashboard({ onOpenInvoice, onOpenPayments }: DashboardProps) {
  const { data, loading, error, reload } = useDashboard()

  if (loading) {
    return (
      <div className="feature">
        <div className="muted">Loading dashboard…</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="feature">
        <div className="form-error">{error ?? 'Failed to load dashboard'}</div>
        <button className="btn" onClick={() => void reload()}>
          Retry
        </button>
      </div>
    )
  }

  const statCards = [
    { label: 'Revenue today', value: formatMoney(data.today.revenue) },
    { label: 'Profit today', value: formatMoney(data.today.profit) },
    { label: 'Sales today', value: String(data.today.count) },
    {
      label: 'Customer outstanding',
      value: formatMoney(data.outstandingBalance),
      tone: data.outstandingBalance > 0 ? 'warn' : '',
    },
  ]

  return (
    <div className="feature">
      <div className="dashboard-header">
        <h3>Dashboard</h3>
        <span className="muted">{formatDate(data.date)}</span>
      </div>

      <div className="stat-grid">
        {statCards.map((c) => (
          <div key={c.label} className={`stat-card${c.tone ? ` ${c.tone}` : ''}`}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-totals">
        <div className="dash-total">
          <span className="stat-label">Customers</span>
          <span className="stat-value">{data.totals.customers}</span>
        </div>
        <div className="dash-total">
          <span className="stat-label">Products</span>
          <span className="stat-value">{data.totals.products}</span>
        </div>
        <div className="dash-total warn">
          <span className="stat-label">Low stock</span>
          <span className="stat-value">{data.totals.productsLowStock}</span>
        </div>
        <div className="dash-total danger">
          <span className="stat-label">Out of stock</span>
          <span className="stat-value">{data.totals.productsOutOfStock}</span>
        </div>
      </div>

      <div className="dash-section">
        <h4 className="section-title">Low stock alerts</h4>
        {data.lowStockItems.length === 0 ? (
          <div className="muted">All stock levels are healthy.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th className="num">Current</th>
                  <th className="num">Reorder level</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockItems.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="mono">{p.sku}</td>
                    <td className="num">{p.currentStock}</td>
                    <td className="num">{p.reorderLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="dash-section">
        <h4 className="section-title">Recent invoices</h4>
        {data.recentInvoices.length === 0 ? (
          <div className="muted">No invoices yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th className="num">Total</th>
                  <th className="num">Outstanding</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono">{inv.invoiceNumber}</td>
                    <td>{inv.customerName}</td>
                    <td>{formatDate(inv.date)}</td>
                    <td className="num">{formatMoney(inv.total)}</td>
                    <td className="num">{formatMoney(inv.outstanding)}</td>
                    <td>
                      <span className={`badge ${statusBadgeTone(inv.status)}`}>
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    <td className="actions-col">
                      <button className="btn small" onClick={() => onOpenInvoice(inv.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="dash-section">
        <h4 className="section-title">Recent payments</h4>
        {data.recentPayments.length === 0 ? (
          <div className="muted">No payments yet.</div>
        ) : (
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Invoice</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPayments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.paymentDate)}</td>
                  <td>{p.customerName}</td>
                  <td className="mono">{p.invoiceNumber ?? '—'}</td>
                  <td className="num">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="btn small" onClick={onOpenPayments}>
          View all payments
        </button>
      </div>

      <ReportsSection />
    </div>
  )
}