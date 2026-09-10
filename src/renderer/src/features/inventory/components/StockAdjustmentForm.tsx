import { useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { CreateStockAdjustmentDTO } from '@shared/types/stock-adjustment'
import { ADJUSTMENT_TYPES, ADJUSTMENT_TYPE_LABELS } from '../../products/types/product-form'

interface StockAdjustmentFormProps {
  product: ProductWithStock
  onSubmit: (data: CreateStockAdjustmentDTO) => Promise<string | null>
  onCancel: () => void
}

export function StockAdjustmentForm({ product, onSubmit, onCancel }: StockAdjustmentFormProps) {
  const [type, setType] = useState<CreateStockAdjustmentDTO['type']>('correction')
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const qty = parseInt(quantity, 10)
    if (Number.isNaN(qty) || qty <= 0) {
      setError('Quantity must be a positive whole number')
      return
    }
    if (!reason.trim()) {
      setError('Reason is required')
      return
    }
    if (direction === 'remove' && qty > product.currentStock) {
      setError(`Only ${product.currentStock} in stock`)
      return
    }

    setSaving(true)
    try {
      const err = await onSubmit({
        productId: product.id,
        type,
        quantityAdjustment: direction === 'add' ? qty : -qty,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      })
      if (err) setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="adjust-form">
      <p className="muted">
        {product.name} — current stock: <strong>{product.currentStock}</strong>
      </p>

      <label className="field">
        <span>Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as CreateStockAdjustmentDTO['type'])}>
          {ADJUSTMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ADJUSTMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <div className="form-grid form-grid-3">
        <label className="field">
          <span>Direction</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}>
            <option value="add">+ Add stock</option>
            <option value="remove">− Remove stock</option>
          </select>
        </label>

        <label className="field">
          <span>Quantity</span>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>

        <label className="field">
          <span>Reason *</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. count correction" />
        </label>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Apply adjustment'}
        </button>
      </div>
    </form>
  )
}