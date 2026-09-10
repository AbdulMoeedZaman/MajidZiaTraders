import { useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'

interface OpeningStockFormProps {
  product: ProductWithStock
  onSubmit: (productId: number, quantity: number) => Promise<string | null>
  onCancel: () => void
}

export function OpeningStockForm({ product, onSubmit, onCancel }: OpeningStockFormProps) {
  const [quantity, setQuantity] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const qty = parseInt(quantity, 10)
    if (Number.isNaN(qty) || qty < 0) {
      setError('Quantity must be 0 or more')
      return
    }

    setSaving(true)
    try {
      const err = await onSubmit(product.id, qty)
      if (err) setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="adjust-form">
      <p className="muted">
        {product.name} — currently {product.currentStock} in stock. This replaces the recorded opening quantity.
      </p>

      <label className="field">
        <span>Opening stock quantity</span>
        <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Set opening stock'}
        </button>
      </div>
    </form>
  )
}