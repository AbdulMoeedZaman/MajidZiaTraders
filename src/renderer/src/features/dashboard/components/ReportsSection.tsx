import { useEffect } from 'react'
import { useReports, ReportTab } from '../../reports/hooks/useReports'
import { STOCK_MOVEMENT_LABELS } from '../../products/types/product-form'
import { PAYMENT_METHOD_LABELS } from '../../payments/types/payment-form'
import { formatDate, formatMoney } from '../../../lib/format'

const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'sales', label: 'Sales' },
  { id: 'profitLoss', label: 'Profit & Loss' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'customers', label: 'Customers' },
  { id: 'payments', label: 'Payments' },
  { id: 'restocks', label: 'Restocks' },
  { id: 'stockMovements', label: 'Stock movements' },
]

export function ReportsSection() {
  const report = useReports()

  useEffect(() => {
    void report.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRangeChange = (patch: Partial<{ from: string; to: string }>) => {
    const next = { ...report.range, ...patch }
    report.setRange(next)
    void report.load(next)
  }

  const data = report.data

  return (
    <div className="dash-section">
      <div className="reports-header">
        <h4 className="section-title">Reports</h4>
        <div className="segmented">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={report.tab === t.id ? 'active' : ''}
              onClick={() => report.setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <label className="range-field">
          From
          <input
            type="date"
            value={report.range.from}
            onChange={(e) => handleRangeChange({ from: e.target.value })}
          />
        </label>
        <label className="range-field">
          To
          <input
            type="date"
            value={report.range.to}
            onChange={(e) => handleRangeChange({ to: e.target.value })}
          />
        </label>
      </div>

      {report.error && <div className="form-error">{report.error}</div>}
      {report.loading && !data ? (
        <div className="muted">Loading reports…</div>
      ) : (
        <div className="report-body">
          {report.tab === 'sales' && <SalesTab data={report.sales} />}
          {report.tab === 'profitLoss' && <ProfitLossTab data={report.profitLoss} />}
          {report.tab === 'inventory' && <InventoryTab data={report.inventory} />}
          {report.tab === 'customers' && <CustomersTab data={report.customers} />}
          {report.tab === 'payments' && <PaymentsTab data={report.payments} />}
          {report.tab === 'restocks' && <RestocksTab data={report.restocks} />}
          {report.tab === 'stockMovements' && <StockMovementsTab data={report.stockMovements} />}
        </div>
      )}
    </div>
  )
}

function SummaryCards({ cards }: { cards: Array<{ label: string; value: string; tone?: string }> }) {
  return (
    <div className="stat-grid">
      {cards.map((c) => (
        <div key={c.label} className={`stat-card${c.tone ? ` ${c.tone}` : ''}`}>
          <div className="stat-label">{c.label}</div>
          <div className="stat-value">{c.value}</div>
        </div>
      ))}
    </div>
  )
}

function SalesTab({ data }: { data: NonNullable<ReturnType<typeof useReports>['sales']> | null }) {
  if (!data) return <div className="muted">No data.</div>
  return (
    <>
      <SummaryCards
        cards={[
          { label: 'Revenue', value: formatMoney(data.totalRevenue) },
          { label: 'Cost of goods', value: formatMoney(data.totalCost) },
          { label: 'Profit', value: formatMoney(data.totalProfit) },
          { label: 'Invoices', value: String(data.totalInvoices) },
          { label: 'Customers', value: String(data.totalCustomers) },
        ]}
      />
      <table className="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th className="num">Qty sold</th>
            <th className="num">Revenue</th>
            <th className="num">Cost</th>
            <th className="num">Profit</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No sales in this period.
              </td>
            </tr>
          )}
          {data.items.map((i) => (
            <tr key={i.productId}>
              <td>{i.productName}</td>
              <td className="mono">{i.productSku}</td>
              <td className="num">{i.quantitySold}</td>
              <td className="num">{formatMoney(i.revenue)}</td>
              <td className="num">{formatMoney(i.cost)}</td>
              <td className="num">{formatMoney(i.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function ProfitLossTab({ data }: { data: NonNullable<ReturnType<typeof useReports>['profitLoss']> | null }) {
  if (!data) return <div className="muted">No data.</div>
  return (
    <>
      <SummaryCards
        cards={[
          { label: 'Revenue', value: formatMoney(data.totalRevenue) },
          { label: 'Cost of goods', value: formatMoney(data.totalCostOfGoods) },
          { label: 'Gross profit', value: formatMoney(data.grossProfit) },
          { label: 'Expenses', value: formatMoney(data.expenses) },
          { label: 'Net profit', value: formatMoney(data.netProfit) },
          {
            label: 'Net margin',
            value: data.profitMargin.toFixed(1) + '%',
            tone: data.profitMargin < 0 ? 'danger' : '',
          },
        ]}
      />
      <div className="muted">
        Revenue is invoice sales after discounts. Running costs such as rent or wages
        are not tracked in this app yet, so expenses show 0 and net profit equals gross profit.
      </div>
    </>
  )
}

function InventoryTab({ data }: { data: NonNullable<ReturnType<typeof useReports>['inventory']> | null }) {
  if (!data) return <div className="muted">No data.</div>
  return (
    <>
      <SummaryCards
        cards={[
          { label: 'Products', value: String(data.totalProducts) },
          { label: 'Stock value (cost)', value: formatMoney(data.totalValue) },
          { label: 'Low stock', value: String(data.lowStockCount) },
        ]}
      />
      <table className="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th className="num">Qty</th>
            <th className="num">Selling price</th>
            <th className="num">Value (cost)</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No products.
              </td>
            </tr>
          )}
          {data.items.map((i) => (
            <tr key={i.productId}>
              <td>{i.productName}</td>
              <td className="mono">{i.productSku}</td>
              <td className="num">{i.currentQuantity}</td>
              <td className="num">{formatMoney(i.price)}</td>
              <td className="num">{formatMoney(i.costValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function CustomersTab({ data }: { data: NonNullable<ReturnType<typeof useReports>['customers']> | null }) {
  if (!data) return <div className="muted">No data.</div>
  return (
    <>
      <SummaryCards
        cards={[
          { label: 'Customers', value: String(data.totalCustomers) },
          { label: 'Purchases', value: formatMoney(data.totalPurchases) },
          { label: 'Payments', value: formatMoney(data.totalPayments) },
          { label: 'Outstanding', value: formatMoney(data.totalOutstanding) },
        ]}
      />
      <table className="data-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th className="num">Purchases (period)</th>
            <th className="num">Payments (period)</th>
            <th className="num">Total purchased</th>
            <th className="num">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No customers.
              </td>
            </tr>
          )}
          {data.items.map((i) => (
            <tr key={i.customerId}>
              <td>{i.customerName}</td>
              <td className="num">{formatMoney(i.periodPurchases)}</td>
              <td className="num">{formatMoney(i.periodPayments)}</td>
              <td className="num">{formatMoney(i.totalPurchases)}</td>
              <td className="num">{formatMoney(i.outstandingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function PaymentsTab({ data }: { data: NonNullable<ReturnType<typeof useReports>['payments']> | null }) {
  if (!data) return <div className="muted">No data.</div>
  return (
    <>
      <SummaryCards
        cards={[
          { label: 'Total received', value: formatMoney(data.totalAmount), tone: 'ok' },
          { label: 'Payments', value: String(data.totalCount) },
        ]}
      />
      {data.byMethod.length > 0 && (
        <div className="method-breakdown">
          {data.byMethod.map((m) => (
            <div key={m.method} className="method-row">
              <span>{PAYMENT_METHOD_LABELS[m.method as keyof typeof PAYMENT_METHOD_LABELS] ?? m.method}</span>
              <span className="num">
                {m.count} · {formatMoney(m.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Customer</th>
            <th>Invoice</th>
            <th>Method</th>
            <th className="num">Amount</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No payments in this period.
              </td>
            </tr>
          )}
          {data.items.map((i) => (
            <tr key={i.paymentId}>
              <td>{formatDate(i.date)}</td>
              <td>{i.customerName}</td>
              <td className="mono">{i.invoiceNumber ?? '—'}</td>
              <td>{PAYMENT_METHOD_LABELS[i.method]}</td>
              <td className="num">{formatMoney(i.amount)}</td>
              <td>{i.reference ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function RestocksTab({ data }: { data: NonNullable<ReturnType<typeof useReports>['restocks']> | null }) {
  if (!data) return <div className="muted">No data.</div>
  return (
    <>
      <SummaryCards
        cards={[
          { label: 'Total restock value', value: formatMoney(data.totalCost) },
          { label: 'Received value', value: formatMoney(data.receivedCost), tone: 'ok' },
          { label: 'Orders', value: String(data.totalCount) },
          { label: 'Received', value: String(data.receivedCount) },
        ]}
      />
      <table className="data-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Supplier</th>
            <th>Date</th>
            <th className="num">Items</th>
            <th className="num">Total cost</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No restocks in this period.
              </td>
            </tr>
          )}
          {data.items.map((i) => (
            <tr key={i.restockId}>
              <td className="mono">{i.referenceNumber}</td>
              <td>{i.supplierName}</td>
              <td>{formatDate(i.date)}</td>
              <td className="num">{i.itemCount}</td>
              <td className="num">{formatMoney(i.totalCost)}</td>
              <td>
                <span className={`badge ${i.status === 'received' ? 'ok' : i.status === 'cancelled' ? 'danger' : 'warn'}`}>
                  {i.status.charAt(0).toUpperCase() + i.status.slice(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function StockMovementsTab({
  data,
}: {
  data: NonNullable<ReturnType<typeof useReports>['stockMovements']> | null
}) {
  if (!data) return <div className="muted">No data.</div>
  return (
    <>
      <SummaryCards
        cards={[
          { label: 'Inbound units', value: String(data.inbound) },
          { label: 'Inbound value', value: formatMoney(data.inboundValue) },
          { label: 'Outbound units', value: String(data.outbound), tone: data.outbound > 0 ? '' : 'ok' },
        ]}
      />
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Product</th>
            <th>SKU</th>
            <th>Type</th>
            <th className="num">Qty</th>
            <th className="num">New qty</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No movements in this period.
              </td>
            </tr>
          )}
          {data.items.map((i) => (
            <tr key={i.movementId}>
              <td>{formatDate(i.date)}</td>
              <td>{i.productName}</td>
              <td className="mono">{i.productSku}</td>
              <td>
                <span className={`badge ${i.quantity > 0 ? 'ok' : 'warn'}`}>
                  {STOCK_MOVEMENT_LABELS[i.type as keyof typeof STOCK_MOVEMENT_LABELS] ?? i.type}
                </span>
              </td>
              <td className="num">{i.quantity > 0 ? `+${i.quantity}` : i.quantity}</td>
              <td className="num">{i.newQuantity}</td>
              <td>{i.reason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}