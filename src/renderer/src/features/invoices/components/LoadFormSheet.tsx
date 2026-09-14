import { localDate } from '../../../lib/format'
import { printDate, printMoney } from '../../../lib/sheet-format'
import type { LoadFormSummary } from '@shared/types/invoice'

interface Props {
  summary: LoadFormSummary
}

/**
 * The printable load form sheet. Shared by the standalone load-form report and
 * the load-form bulk print (where it leads the print job).
 */
export function LoadFormSheet({ summary }: Props) {
  return (
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
              <th>Pcs</th>
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
  )
}