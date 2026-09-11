import { useState } from 'react'
import type { Product } from '@shared/types/product'
import type { Category } from '@shared/types/category'
import {
  ProductFormMode,
  ProductFormState,
  fromProductFormState,
  toProductFormState,
} from '../types/product-form'

interface ProductFormProps {
  mode: ProductFormMode
  product: Product | null
  categories: Category[]
  onSubmit: (payload: Record<string, unknown>) => Promise<string | null>
  onCancel: () => void
}

export function ProductForm({ mode, product, categories, onSubmit, onCancel }: ProductFormProps) {
  const [state, setState] = useState<ProductFormState>(() => toProductFormState(product))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const set = (field: keyof ProductFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setState((s) => ({ ...s, [field]: e.target.value }))

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!state.name.trim()) next.name = 'Name is required'
    if (mode === 'create' && !state.sku.trim()) next.sku = 'SKU is required'

    const cost = parseFloat(state.baseCostPrice)
    const min = parseFloat(state.minSellingPrice)
    const sell = parseFloat(state.sellingPrice)

    if (Number.isNaN(cost) || cost < 0) next.baseCostPrice = 'Must be 0 or more'
    if (Number.isNaN(min) || min < 0) next.minSellingPrice = 'Must be 0 or more'
    if (Number.isNaN(sell) || sell < 0) next.sellingPrice = 'Must be 0 or more'
    if (!Number.isNaN(sell) && !Number.isNaN(min) && sell < min) {
      next.sellingPrice = 'Cannot be lower than the minimum selling price'
    }
    const pieces = parseInt(state.piecesPerCarton, 10)
    if (Number.isNaN(pieces) || pieces < 1) next.piecesPerCarton = 'Must be at least 1'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    setSaving(true)
    try {
      const err = await onSubmit(fromProductFormState(state, mode))
      if (err) setServerError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field">
          <span>Name *</span>
          <input value={state.name} onChange={set('name')} placeholder="e.g. Acme Widget" />
          {errors.name && <em className="field-error">{errors.name}</em>}
        </label>

        <label className="field">
          <span>SKU *</span>
          <input value={state.sku} onChange={set('sku')} placeholder="Unique SKU" disabled={mode === 'edit'} />
          {errors.sku && <em className="field-error">{errors.sku}</em>}
        </label>

        <label className="field field-span-2">
          <span>Description</span>
          <textarea value={state.description} onChange={set('description')} rows={2} />
        </label>

        <label className="field">
          <span>Category</span>
          <select value={state.categoryId} onChange={set('categoryId')}>
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Unit</span>
          <input value={state.unit} onChange={set('unit')} placeholder="piece / carton / kg" />
        </label>

        <label className="field">
          <span>Pieces per carton</span>
          <input type="number" min={1} value={state.piecesPerCarton} onChange={set('piecesPerCarton')} />
          {errors.piecesPerCarton && <em className="field-error">{errors.piecesPerCarton}</em>}
        </label>

        <label className="field">
          <span>Pack size</span>
          <input value={state.packSize} onChange={set('packSize')} placeholder="e.g. 33g" />
        </label>

        <label className="field">
          <span>Pack config</span>
          <input value={state.packConfig} onChange={set('packConfig')} placeholder="e.g. 6x24" />
        </label>

        <label className="field">
          <span>MRP per piece</span>
          <input type="number" step="0.01" min={0} value={state.mrp} onChange={set('mrp')} placeholder="e.g. 25.00" />
        </label>

        <label className="field">
          <span>Purchase unit</span>
          <input value={state.purchaseUnit} onChange={set('purchaseUnit')} placeholder="carton" />
        </label>

        <label className="field">
          <span>Reorder level</span>
          <input type="number" min={0} value={state.reorderLevel} onChange={set('reorderLevel')} />
        </label>

        <label className="field">
          <span>Base cost price</span>
          <input type="number" step="0.01" min={0} value={state.baseCostPrice} onChange={set('baseCostPrice')} />
          {errors.baseCostPrice && <em className="field-error">{errors.baseCostPrice}</em>}
        </label>

        <label className="field">
          <span>Min selling price</span>
          <input type="number" step="0.01" min={0} value={state.minSellingPrice} onChange={set('minSellingPrice')} />
          {errors.minSellingPrice && <em className="field-error">{errors.minSellingPrice}</em>}
        </label>

        <label className="field">
          <span>Selling price</span>
          <input type="number" step="0.01" min={0} value={state.sellingPrice} onChange={set('sellingPrice')} />
          {errors.sellingPrice && <em className="field-error">{errors.sellingPrice}</em>}
        </label>
      </div>

      {serverError && <div className="form-error">{serverError}</div>}

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}