import { useEffect, useState } from 'react'
import type { Product } from '@shared/types/product'
import { countToInt, moneyToCents } from '../../../lib/money'

export interface ProductFormData {
  name: string
  rate: string
  boxesPerCarton: string
}

interface Props {
  initial?: Product | null
  onSave: (data: { name: string; rate: number; boxesPerCarton: number }) => Promise<void>
  onCancel: () => void
}

export function ProductForm({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [rate, setRate] = useState(initial ? (initial.rate / 100).toFixed(2) : '')
  const [boxesPerCarton, setBoxesPerCarton] = useState(
    initial ? String(initial.boxesPerCarton) : '12'
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
    const boxes = countToInt(boxesPerCarton)
    if (boxes < 1) {
      setError('Boxes per carton must be at least 1')
      return
    }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), rate: rateCents, boxesPerCarton: boxes })
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
            <span>Minimum rate (₹)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="field">
            <span>Boxes per carton</span>
            <input
              type="number"
              min="1"
              step="1"
              value={boxesPerCarton}
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