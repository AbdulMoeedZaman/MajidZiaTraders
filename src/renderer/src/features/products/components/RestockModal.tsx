import { useEffect, useState } from 'react'
import type { Product } from '@shared/types/product'
import type { CreateRestockDTO } from '@shared/types/stock'
import { SearchSelect } from '../../../components/SearchSelect'

interface Props {
  products: Product[]
  onConfirm: (data: CreateRestockDTO) => Promise<void>
  onCancel: () => void
}

export function RestockModal({ products, onConfirm, onCancel }: Props) {
  const [productId, setProductId] = useState<number | null>(products[0]?.id ?? null)
  const [quantity, setQuantity] = useState('')
  const [loosePieces, setLoosePieces] = useState('')
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
    if (productId === null) {
      setError('Select a product')
      return
    }
    const qty = Number(quantity)
    const loose = Number(loosePieces)
    if (quantity !== '' && (!Number.isInteger(qty) || qty < 0)) {
      setError('Cartons must be a whole number of at least 0')
      return
    }
    if (loosePieces !== '' && (!Number.isInteger(loose) || loose < 0)) {
      setError('Loose pieces must be a whole number of at least 0')
      return
    }
    if ((Number.isInteger(qty) ? qty : 0) === 0 && (Number.isInteger(loose) ? loose : 0) === 0) {
      setError('Enter cartons or loose pieces to restock')
      return
    }
    setSaving(true)
    try {
      await onConfirm({
        productId,
        quantity: quantity === '' ? 0 : qty,
        loosePieces: loosePieces === '' ? 0 : loose,
      })
      onCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restock product')
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Restock Product</h3>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <label className="field field-span-2">
            <span>Product</span>
            <SearchSelect
              options={products.map((p) => ({ value: p.id, label: p.name }))}
              value={productId}
              onChange={setProductId}
              placeholder="Select product…"
              allowClear
            />
          </label>
          <label className="field">
            <span>Cartons</span>
            <input
              type="number"
              min="0"
              step="1"
              value={quantity}
              autoFocus
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="field">
            <span>Loose pcs</span>
            <input
              type="number"
              min="0"
              step="1"
              value={loosePieces}
              onChange={(e) => setLoosePieces(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>
        <div className="form-actions">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? 'Adding…' : 'Add Stock'}
          </button>
        </div>
      </div>
    </div>
  )
}