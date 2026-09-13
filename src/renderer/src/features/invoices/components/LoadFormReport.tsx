import { localDate } from '../../../lib/format'
import type { LoadFormSummary } from '@shared/types/invoice'

function printDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

function printMoney(cents: number | null | undefined): string {
  return (
    'Rs.' +
    ((cents ?? 0) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

interface Props {
  summary: LoadFormSummary
  onClose: () => void
}

export function LoadFormReport({ summary, onClose }: Props) {
  return (
    <div className="feature">
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn ghost" onClick={onClose}>
          Back to Invoices
        </button>
        <button className="btn primary" onClick={() => window.print()}>
          🖨 Print
        </button>
      </div>

      <div className="invoice-sheet">
        <div className="ip-owner">Load Form</div>
        <div className="ip-band">
          <div>Date: {printDate(localDate(new Date()))}</div>
          {summary.invoiceNumbers.length > 0 && (
            <div>Invoices: {summary.invoiceNumbers.join(', ')}</div>
          )}
        </div>

        <div className="section-title">Products</div>
        {summary.products.length === 0 ? (
          <div className="empty-state">No product lines in the selected invoices.</div>
        ) : (
          <table className="ip-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Cartons</th>
                <th>Boxes</th>
                <th>Total qty</th>
              </tr>
            </thead>
            <tbody>
              {summary.products.map((p) => (
                <tr key={p.productId}>
                  <td>{p.productName}</td>
                  <td className="ip-num">{p.cartonCount}</td>
                  <td className="ip-num">{p.boxCount}</td>
                  <td className="ip-num">{p.totalQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="section-title">Customers</div>
        {summary.customers.length === 0 ? (
          <div className="empty-state">No customers in the selected invoices.</div>
        ) : (
          <table className="ip-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {summary.customers.map((c) => (
                <tr key={c.customerId}>
                  <td>{c.customerName}</td>
                  <td className="ip-num">{printMoney(c.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ip-total-row">
                <td className="ip-total-label">Grand total</td>
                <td className="ip-num">{printMoney(summary.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        </div>
    </div>
  )
}