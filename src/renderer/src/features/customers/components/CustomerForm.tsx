import { useState } from 'react'
import type { Customer, CreateCustomerDTO } from '@shared/types/customer'
import { CustomerFormMode, fromCustomerFormState, toCustomerFormState } from '../types/customer-form'

interface CustomerFormProps {
  mode: CustomerFormMode
  customer: Customer | null
  onSubmit: (payload: CreateCustomerDTO) => Promise<string | null>
  onCancel: () => void
}

export function CustomerForm({ mode, customer, onSubmit, onCancel }: CustomerFormProps) {
  const [state, setState] = useState(() => toCustomerFormState(customer))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const set =
    (field: keyof typeof state) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setState((s) => ({ ...s, [field]: e.target.value }))

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!state.name.trim()) next.name = 'Name is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    setSaving(true)
    try {
      const payload = fromCustomerFormState(state)
      const err = await onSubmit(payload)
      if (err) setServerError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="customer-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field">
          <span>Name *</span>
          <input value={state.name} onChange={set('name')} placeholder="Customer name" autoFocus />
          {errors.name && <em className="field-error">{errors.name}</em>}
        </label>

        <label className="field">
          <span>Address</span>
          <input value={state.address} onChange={set('address')} placeholder="Street, city, area…" />
        </label>
      </div>

      {serverError && <div className="form-error">{serverError}</div>}

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : mode === 'create' ? 'Create customer' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}