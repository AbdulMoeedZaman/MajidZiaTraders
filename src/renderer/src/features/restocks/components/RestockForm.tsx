import { useMemo, useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { CreateRestockDTO } from '@shared/types/restock'
import {
  RestockFormState,
  RestockItemInput,
  defaultRestockFormState,
} from '../types/restock-form'

interface RestockFormProps {
  products: ProductWithStock[]
  initial?: Partial<RestockFormState>
  onSubmit: (payload: CreateRestockDTO) => Promise<string | null>
  onCancel: () => void
}

export function RestockForm({ products, initial, onSubmit, onCancel }: RestockFormProps) {
  const [state, setState] = useState<RestockFormState>(() => ({
    ...defaultRestockFormState(),
    ...initial,
    items: initial?.items?.length ? initial.items : [],
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const totalCost = useMemo(
    () =>
      state.items.reduce((sum, item) => {
        const qty = parseInt(item.quantity || '0', 10)
        const cost = parseFloat(item.unitCost || '0')
        return sum + Math.max(0, qty) * Math.max(0, cost)
      }, 0),
    [state.items]
  )

  const addItem = () => {
    setState((s) => ({
      ...s,
      items: [...s.items, { productId: '', unit: 'piece', quantity: '1', unitCost: '' }],
    }))
  }

  const updateItem = (index: number, patch: Partial<RestockItemInput>) => {
    setState((s) => ({
      ...s,
      items: s.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }))
  }

  const removeItem = (index: number) => {
    setState((s) => ({ ...s, items: s.items.filter((_, i) => i !== index) }))
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!state.supplierName.trim()) next.supplierName = 'Supplier name is required'
    if (state.items.length === 0) next.items = 'Add at least one item'
    state.items.forEach((item, i) => {
      if (!item.productId) next[`item-${i}`] = 'Choose a product'
      const qty = parseInt(item.quantity || '0', 10)
      if (!Number.isInteger(qty) || qty <= 0) next[`item-${i}`] = 'Quantity must be a positive whole number'
      const cost = parseFloat(item.unitCost || '')
      if (Number.isNaN(cost) || cost < 0) next[`item-${i}`] = 'Unit cost must be 0 or more'
    })
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    const payload: CreateRestockDTO = {
      supplierName: state.supplierName.trim(),
      date: state.date,
      notes: state.notes.trim() || null,
      items: state.items.map((item) => ({
        productId: parseInt(item.productId, 10),
        unit: item.unit.trim() || 'piece',
        quantity: parseInt(item.quantity, 10),
        unitCost: Math.round(parseFloat(item.unitCost || '0') * 100),
      })),
    }

    setSaving(true)
    try {
      const err = await onSubmit(payload)
      if (err) setServerError(err)
    } finally {
      setSaving(false)
    }
  }

  const availableProducts = products

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field">
          <span>Supplier name *</span>
          <input
            value={state.supplierName}
            onChange={(e) => setState((s) => ({ ...s, supplierName: e.target.value }))}
            placeholder="e.g. Acme Distributors"
          />
          {errors.supplierName && <em className="field-error">{errors.supplierName}</em>}
        </label>

        <label className="field">
          <span>Date *</span>
          <input
            type="date"
            value={state.date}
            onChange={(e) => setState((s) => ({ ...s, date: e.target.value }))}
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

      <div className="field">
        <span>Items *</span>
        {errors.items && <em className="field-error">{errors.items}</em>}
      </div>

      <div className="item-lines">
        {state.items.map((item, i) => {
          const available = availableProducts.find((p) => p.id === parseInt(item.productId, 10))
          const qty = parseInt(item.quantity || '0', 10)
          const cost = parseFloat(item.unitCost || '0')
          return (
            <div key={i} className="item-line">
              <select
                value={item.productId}
                onChange={(e) => {
                  const product = availableProducts.find(
                    (p) => p.id === parseInt(e.target.value, 10)
                  )
                  updateItem(i, {
                    productId: e.target.value,
                    unit: product?.unit ?? 'piece',
                  })
                }}
              >
                <option value="">Select product…</option>
                {availableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — {p.currentStock} in stock
                  </option>
                ))}
              </select>
              <input
                className="qty-input"
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => updateItem(i, { quantity: e.target.value })}
                aria-label="Quantity"
              />
              <input
                className="line-input"
                value={item.unit}
                onChange={(e) => updateItem(i, { unit: e.target.value })}
                aria-label="Unit"
              />
              <input
                className="line-input money"
                type="number"
                step="0.01"
                min={0}
                value={item.unitCost}
                onChange={(e) => updateItem(i, { unitCost: e.target.value })}
                aria-label="Unit cost"
                placeholder="Unit cost"
              />
              <span className="line-total">${(qty * cost).toFixed(2)}</span>
              <button type="button" className="btn ghost icon" onClick={() => removeItem(i)} title="Remove item">
                ✕
              </button>
              {errors[`item-${i}`] && <em className="field-error">{errors[`item-${i}`]}</em>}
            </div>
          )
        })}
      </div>

      {availableProducts.length > 0 && (
        <button type="button" className="btn small ghost" onClick={addItem}>
          + Add item
        </button>
      )}

      <div className="totals-row">
        <strong>Total cost</strong>
        <strong>${totalCost.toFixed(2)}</strong>
      </div>

      {serverError && <div className="form-error">{serverError}</div>}

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save restock'}
        </button>
      </div>
    </form>
  )
}