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
  const totalCtn = summary.products.reduce((sum, p) => sum + p.cartonCount, 0)
  const totalPcs = summary.products.reduce((sum, p) => sum + p.boxCount, 0)

  return (
    <div className="invoice-sheet">
      <div className="sheet-head">
        <div className="ip-owner">Load Form</div>
      </div>

      <div className="ip-meta">
        <div className="ip-customer-box">
          <div className="ip-meta-line"><span>Invoices:</span> <strong>{summary.invoiceNumbers.join(', ')}</strong></div>
          <div className="ip-meta-line"><span>Products:</span> <strong>{summary.products.length}</strong></div>
          <div className="ip-meta-line"><span>Shops:</span> <strong>{summary.customers.length}</strong></div>
        </div>
        <div className="ip-meta-right">
          <div className="ip-meta-line right"><span>Date:</span> <span>{printDate(localDate(new Date()))}</span></div>
        </div>
      </div>

      <table className="ip-table">
        <thead>
          <tr>
            <th>Products</th>
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

      <table className="ip-table" style={{ marginTop: 14 }}>
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
      </table>

      <div className="ip-footer">
        <div className="ip-left-col">
          <div className="ip-box">
            <div className="ip-box-heading">Quantity Breakdown</div>
            <div className="ip-sum-row"><span>Total Ctn (Cartons)</span><strong>{totalCtn}</strong></div>
            <div className="ip-sum-row"><span>Total Pcs</span><strong>{totalPcs}</strong></div>
          </div>
        </div>

        <div className="ip-finance">
          <div className="ip-fin-row ip-net">
            <span>Grand Total</span>
            <strong>{printMoney(summary.grandTotal)}</strong>
          </div>
        </div>
      </div>

      <div className="ip-signatures">
        <div className="ip-signature-field">
          <div className="ip-signature-line" />
          <span>Signature</span>
        </div>
      </div>
    </div>
  )
}
