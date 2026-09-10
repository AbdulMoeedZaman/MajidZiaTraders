import type { CustomerLedgerEntryWithBalance } from '@shared/types/customer-ledger'
import { formatDate, formatMoney } from '../../../lib/format'
import { LEDGER_TYPE_LABELS } from '../types/customer-form'

interface CustomerLedgerTableProps {
  entries: CustomerLedgerEntryWithBalance[]
  loading: boolean
  error: string | null
}

function referenceLabel(entry: CustomerLedgerEntryWithBalance): string {
  if (!entry.referenceType) return '—'
  const refId = entry.referenceId != null ? ` #${entry.referenceId}` : ''
  return `${entry.referenceType}${refId}`
}

export function CustomerLedgerTable({ entries, loading, error }: CustomerLedgerTableProps) {
  if (loading) return <div className="muted">Loading…</div>
  if (error) return <div className="form-error">{error}</div>
  if (entries.length === 0) return <div className="muted">No ledger entries.</div>

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Reference</th>
            <th>Description</th>
            <th className="num">Debit</th>
            <th className="num">Credit</th>
            <th className="num">Running balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const isCredit = e.type === 'payment' || e.type === 'credit_note'
            return (
              <tr key={e.id}>
                <td>{formatDate(e.transactionDate)}</td>
                <td>
                  <span className={`badge ${isCredit ? 'ok' : 'warn'}`}>
                    {LEDGER_TYPE_LABELS[e.type] ?? e.type}
                  </span>
                </td>
                <td className="mono">{referenceLabel(e)}</td>
                <td>{e.description ?? '—'}</td>
                <td className="num">
                  {e.debit > 0 ? <span className="text-danger">{formatMoney(e.debit)}</span> : '—'}
                </td>
                <td className="num">
                  {e.credit > 0 ? <span className="text-ok">{formatMoney(e.credit)}</span> : '—'}
                </td>
                <td
                  className={`num ${
                    e.runningBalance > 0 ? 'text-warn' : e.runningBalance < 0 ? 'text-ok' : ''
                  }`}
                >
                  {formatMoney(e.runningBalance)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}