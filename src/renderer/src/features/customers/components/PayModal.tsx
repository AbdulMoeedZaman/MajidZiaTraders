import { useEffect, useState } from 'react'
import { formatMoney } from '../../../lib/format'
import { moneyToCents } from '../../../lib/money'

interface Props {
  customerName: string
  outstanding: number
  openInvoices: number
  onConfirm: (amountCents: number) => Promise<void>
  onCancel: () => void
}

export function PayModal({ customerName, outstanding, openInvoices, onConfirm, onCancel }: Props) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const confirm = async () => {
    setError(null)
    const cents = moneyToCents(amount)
    if (cents <= 0) {
      setError('Enter an amount greater than zero')
      return
    }
    if (cents > outstanding) {
      setError(`Cannot exceed the outstanding balance (${formatMoney(outstanding)})`)
      return
    }
    setSaving(true)
    try {
      await onConfirm(cents)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record payment')
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Receive Payment</h3>
        </div>
        <div className="pay-modal-info">
          <div>
            <span className="muted fine-text">Customer</span>
            <strong>{customerName}</strong>
          </div>
          <div>
            <span className="muted fine-text">Outstanding balance</span>
            <strong className="mono">{formatMoney(outstanding)}</strong>
          </div>
          <div>
            <span className="muted fine-text">Open invoices</span>
            <strong>{openInvoices}</strong>
          </div>
          <p className="muted fine-text">
            The amount is applied to this customer's open invoices, oldest first.
          </p>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <label className="field field-span-2">
            <span>Amount (Rs.)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>
        <div className="form-actions">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void confirm()} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}