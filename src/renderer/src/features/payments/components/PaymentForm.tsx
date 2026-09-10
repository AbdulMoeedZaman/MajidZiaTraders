import { useEffect, useMemo, useState } from 'react'
import type { CustomerWithBalance } from '@shared/types/customer'
import type { InvoiceWithCustomer } from '@shared/types/invoice'
import type { CreateCustomerPaymentDTO } from '@shared/types/customer-payment'
import { api } from '../../../lib/api'
import { formatMoney } from '../../../lib/format'
import { PaymentFormState, defaultPaymentFormState, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../types/payment-form'

interface PaymentFormProps {
  customers: CustomerWithBalance[]
  initialCustomerId?: number
  invoice?: InvoiceWithCustomer | null
  onSuccess?: () => void
  onCancel: () => void
}

export function PaymentForm({ customers, initialCustomerId, invoice, onSuccess, onCancel }: PaymentFormProps) {
  const [state, setState] = useState<PaymentFormState>(() => ({
    ...defaultPaymentFormState(),
    customerId: invoice ? String(invoice.customerId) : initialCustomerId ? String(initialCustomerId) : '',
    invoiceId: invoice ? String(invoice.id) : '',
  }))
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.invoices
      .list()
      .then(setInvoices)
      .catch(() => setInvoices([]))
  }, [])

  const customerInvoices = useMemo(
    () =>
      invoices.filter((i) => {
        if (!state.customerId) return false
        if (i.customerId !== parseInt(state.customerId, 10)) return false
        if (i.status === 'cancelled' || i.status === 'paid') return false
        return i.outstanding > 0
      }),
    [invoices, state.customerId]
  )

  useEffect(() => {
    if (invoice) return
    const selected = customerInvoices.find((i) => i.id === parseInt(state.invoiceId, 10))
    if (selected) {
      setState((s) => ({
        ...s,
        amount: String(selected.outstanding / 100),
      }))
    }
  }, [customerInvoices, state.invoiceId, invoice])

  const selectedInvoice = useMemo(() => {
    if (invoice) return invoice
    return customerInvoices.find((i) => i.id === parseInt(state.invoiceId, 10))
  }, [invoice, customerInvoices, state.invoiceId])

  const maxAmount = selectedInvoice ? selectedInvoice.outstanding : null

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!state.customerId) next.customerId = 'Choose a customer'
    const amount = parseFloat(state.amount || '')
    if (Number.isNaN(amount) || amount <= 0) next.amount = 'Amount must be greater than 0'
    else if (maxAmount != null && Math.round(amount * 100) > maxAmount) {
      next.amount = `Cannot exceed outstanding ${formatMoney(maxAmount)}`
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    const payload: CreateCustomerPaymentDTO = {
      customerId: parseInt(state.customerId, 10),
      invoiceId: state.invoiceId ? parseInt(state.invoiceId, 10) : undefined,
      amount: Math.round(parseFloat(state.amount || '0') * 100),
      method: state.method,
      paymentDate: state.paymentDate,
      reference: state.reference.trim() || undefined,
      notes: state.notes.trim() || undefined,
    }

    setSaving(true)
    try {
      await api.payments.create(payload)
      onSuccess?.()
    } catch (err) {
      setServerError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field field-span-2">
          <span>Customer *</span>
          <select
            value={state.customerId}
            disabled={invoice != null}
            onChange={(e) => setState((s) => ({ ...s, customerId: e.target.value, invoiceId: '' }))}
          >
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.customerId && <em className="field-error">{errors.customerId}</em>}
        </label>

        {!invoice && (
          <label className="field field-span-2">
            <span>Invoice (optional)</span>
            <select
              value={state.invoiceId}
              onChange={(e) => setState((s) => ({ ...s, invoiceId: e.target.value }))}
            >
              <option value="">No invoice — generic payment</option>
              {customerInvoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoiceNumber} — outstanding {formatMoney(i.outstanding)}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>Date *</span>
          <input
            type="date"
            value={state.paymentDate}
            onChange={(e) => setState((s) => ({ ...s, paymentDate: e.target.value }))}
          />
        </label>

        <label className="field">
          <span>Method *</span>
          <select
            value={state.method}
            onChange={(e) => setState((s) => ({ ...s, method: e.target.value as PaymentFormState['method'] }))}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Amount *</span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={state.amount}
            onChange={(e) => setState((s) => ({ ...s, amount: e.target.value }))}
            placeholder={maxAmount != null ? `Max ${formatMoney(maxAmount)}` : '0.00'}
          />
          {errors.amount && <em className="field-error">{errors.amount}</em>}
          {maxAmount != null && (
            <span className="fine-text muted">Outstanding: {formatMoney(maxAmount)}</span>
          )}
        </label>

        <label className="field">
          <span>Reference</span>
          <input
            value={state.reference}
            onChange={(e) => setState((s) => ({ ...s, reference: e.target.value }))}
            placeholder="e.g. cheque no."
          />
        </label>

        <label className="field field-span-2">
          <span>Notes</span>
          <textarea
            value={state.notes}
            onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
            rows={2}
          />
        </label>
      </div>

      {serverError && <div className="form-error">{serverError}</div>}

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Record payment'}
        </button>
      </div>
    </form>
  )
}