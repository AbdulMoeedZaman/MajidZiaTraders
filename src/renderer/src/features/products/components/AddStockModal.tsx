import { useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { AddStockDTO } from '@shared/types/restock'
import { formatMoney } from '../../../lib/format'

interface AddStockModalProps {
  product: ProductWithStock
  onSubmit: (data: AddStockDTO) => Promise<string | null>
  onClose: () => void
}

export function AddStockModal({ product, onSubmit, onClose }: AddStockModalProps) {
  const [quantity, setQuantity] = useState('')
  const [costPerUnit, setCostPerUnit] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    const qty = parseInt(quantity, 10)
    if (Number.isNaN(qty) || qty < 1) next.quantity = 'Must be at least 1'
    if (costPerUnit.trim() && (Number.isNaN(parseFloat(costPerUnit)) || parseFloat(costPerUnit) < 0)) {
      next.costPerUnit = 'Must be 0 or more'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    const payload: AddStockDTO = {
      productId: product.id,
      quantity: parseInt(quantity, 10),
    }
    if (costPerUnit.trim()) payload.costPerUnit = Math.round(parseFloat(costPerUnit) * 100)
    if (supplierName.trim()) payload.supplierName = supplierName.trim()
    if (note.trim()) payload.note = note.trim()

    setSaving(true)
    try {
      const err = await onSubmit(payload)
      if (err) setServerError(err)
      else setQuantity('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      <div className="detail-stock" style={{ justifyContent: 'flex-start' }}>
        <span className="stock-qty">{product.currentStock}</span>
        <span className="muted">current stock</span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Quantity *</span>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          {errors.quantity && <em className="field-error">{errors.quantity}</em>}
        </label>

        <label className="field">
          <span>Cost per unit</span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={costPerUnit}
            placeholder={formatMoney(product.baseCostPrice)}
            onChange={(e) => setCostPerUnit(e.target.value)}
          />
          {errors.costPerUnit && <em className="field-error">{errors.costPerUnit}</em>}
        </label>

        <label className="field">
          <span>Supplier</span>
          <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Direct stock-in" />
        </label>

        <label className="field">
          <span>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      {serverError && <div className="form-error">{serverError}</div>}

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add stock'}
        </button>
      </div>
    </form>
  )
}