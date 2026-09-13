import type { InvoiceStatus } from '@shared/types/invoice'

const LABELS: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  partial: 'Partial',
  unpaid: 'Unpaid',
  cancelled: 'Cancelled',
}

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`status-badge status-${status}`}>{LABELS[status]}</span>
}