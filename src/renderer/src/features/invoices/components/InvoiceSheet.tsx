import { printDate, printMoney } from '../../../lib/sheet-format'
import type { InvoiceDetails } from '@shared/types/invoice'

interface Props {
  details: InvoiceDetails
  /** The invoice_description setting, rendered under the sheet (rich text). */
  description: string
}

/**
 * The printable invoice matrix sheet. Shared by the single-invoice detail page
 * and the load-form bulk print (where it is laid out two per landscape page).
 */
export function InvoiceSheet({ details, description }: Props) {
  const { invoice, customer, owner, broker } = details
  const totalCtn = invoice.items.reduce((sum, it) => sum + it.cartonCount, 0)
  const totalPcs = invoice.items.reduce((sum, it) => sum + it.boxCount, 0)

  return (
    <div className="invoice-sheet">
      {/* ── Company Header (centered) ────────────────────────────────── */}
      {owner && (
        <div className="sheet-head">
          <div className="ip-owner">{owner.name}</div>
          <div className="ip-subtitle">
            {owner.address && <span className="ip-address">{owner.address}</span>}
            {owner.address && owner.phone && <span className="ip-comma">,</span>}
            {owner.phone && <span className="ip-phone">{owner.phone}</span>}
          </div>
        </div>
      )}

      {/* ── Metadata boxes ───────────────────────────────────────────── */}
      <div className="ip-meta">
        <div className="ip-customer-box">
          {customer && (
            <>
              <div className="ip-meta-line"><span>Shop name:</span> <strong>{customer.shopName}</strong></div>
              <div className="ip-meta-line"><span>Owner name:</span> <strong>{customer.ownerName}</strong></div>
              <div className="ip-meta-line"><span>Address:</span> {customer.address}</div>
              <div className="ip-meta-line"><span>Phone:</span> {customer.phone}</div>
              <div className="ip-meta-line"><span>Status:</span>{invoice.filerStatus === 'filer' ? 'Filer' : 'Non Filer'}</div>
            </>
          )}
        </div>
        <div className="ip-meta-right">
          <div className="ip-meta-line right"><span>Date:</span> <span>{printDate(invoice.date)}</span></div>
          {broker && (
            <>
              <div className="ip-meta-line right"><span>Order Booker:</span> <span><strong>{broker.name}</strong></span></div>
              <div className="ip-meta-line right"><span>PH#:</span> <span>{broker.phone ?? '—'}</span></div>

              <span className="ip-title-number">{invoice.invoiceNumber}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Items table ──────────────────────────────────────────────── */}
      <table className="ip-table">
        <thead>
          <tr>
            <th>Products</th>
            <th>Rate</th>
            <th>Cartons</th>
            <th>Pcs</th>
            <th>Scheme</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={item.id ?? i}>
              <td>{item.productName}</td>
              <td className="ip-num">{printMoney(item.rate)}</td>
              <td className="ip-num">{item.cartonCount}</td>
              <td className="ip-num">{item.boxCount}</td>
              <td className="ip-scheme" />
              <td className="ip-num">{printMoney(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Footer: quantities / balances + financials ────────────────── */}
      <div className="ip-footer">
        <div className="ip-left-col">
          <div className="ip-box">
            <div className="ip-box-heading">Quantity Breakdown</div>
            <div className="ip-sum-row"><span>Total Ctn (Cartons)</span><strong>{totalCtn}</strong></div>
            <div className="ip-sum-row"><span>Total Pcs</span><strong>{totalPcs}</strong></div>
          </div>
        </div>

        <div className="ip-finance">
          <div className="ip-fin-row"><span>Total Gross Amount</span><strong>{printMoney(invoice.subtotal)}</strong></div>
          <div className="ip-fin-row"><span>Previous Balance</span><strong>{'—'}</strong></div>
          <div className="ip-fin-row">
            <span>Tax</span>
            <strong>{invoice.tax != null ? printMoney(invoice.tax) : '—'}</strong>
          </div>
          <div className="ip-fin-row ip-net">
            <span>Net Amount / Grand Total</span>
            <strong>{printMoney(invoice.grandTotal ?? invoice.subtotal)}</strong>
          </div>
        </div>
      </div>

      {/* ── Signature ────────────────────────────────────────────────── */}
      <div className="ip-signatures">
        <div className="ip-signature-field">
          <div className="ip-signature-line" />
          <span>Signature</span>
        </div>
      </div>

      {description && (
        <div
          className="ip-description"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      )}
    </div>
  )
}