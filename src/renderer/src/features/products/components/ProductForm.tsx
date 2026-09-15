import { useEffect, useState } from 'react'
import type { Product } from '@shared/types/product'
import { countToInt, centsToRupees, moneyToCents } from '../../../lib/money'

export interface ProductFormData {
  name: string
  rate: string
  salesPrice: string
  piecesPerCarton: string
}

interface Props {
  initial?: Product | null
  onSave: (data: { name: string; rate: number; salesPrice: number | null; piecesPerCarton: number }) => Promise<void>
  onCancel: () => void
}

export function ProductForm({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [rate, setRate] = useState(initial ? centsToRupees(initial.rate) : '')
  const [salesPrice, setSalesPrice] = useState(
    initial?.salesPrice != null ? centsToRupees(initial.salesPrice) : ''
  )
  const [piecesPerCarton, setBoxesPerCarton] = useState(
    initial ? String(initial.piecesPerCarton) : '12'
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const submit = async () => {
    setError(null)
    if (!name.trim()) {
      setError('Product name is required')
      return
    }
    const rateCents = moneyToCents(rate)
    if (rateCents <= 0) {
      setError('Minimum rate must be greater than zero')
      return
    }
    const boxes = countToInt(piecesPerCarton)
    if (boxes < 1) {
       setError('Pieces per carton must be at least 1')
      return
    }
    setSaving(true)
    try {
      const salesCents = salesPrice.trim() === '' ? null : moneyToCents(salesPrice)
      await onSave({ name: name.trim(), rate: rateCents, salesPrice: salesCents, piecesPerCarton: boxes })
      onCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save product')
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{initial ? 'Edit Product' : 'Add Product'}</h3>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <label className="field field-span-2">
            <span>Product name</span>
            <input
              type="text"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Axle bearing 6204"
            />
          </label>
          <label className="field">
            <span>Minimum rate (Rs.)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="field">
            <span>Sales price (Rs.)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={salesPrice}
              onChange={(e) => setSalesPrice(e.target.value)}
              placeholder="Optional — used to auto-fill invoices"
            />
          </label>
          <label className="field">
             <span>Pieces per carton</span>
            <input
              type="number"
              min="1"
              step="1"
              value={piecesPerCarton}
              onChange={(e) => setBoxesPerCarton(e.target.value)}
              placeholder="12"
            />
          </label>
        </div>
        <div className="form-actions">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}