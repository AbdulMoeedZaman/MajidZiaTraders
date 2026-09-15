import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import { SearchSelect } from '../../../components/SearchSelect'
import { formatMoney } from '../../../lib/format'
import { moneyToCents } from '../../../lib/money'
import type { CustomerProductPreference } from '@shared/types/product-preference'
import type { Product } from '@shared/types/product'

interface Props {
  customerId: number
  customerName: string
  onSaved: (message: string) => void
  onCancel: () => void
}

export function ProductPreferencesModal({ customerId, customerName, onSaved, onCancel }: Props) {
  const [preferences, setPreferences] = useState<CustomerProductPreference[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [editing, setEditing] = useState<CustomerProductPreference | null>(null)
  const [adding, setAdding] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const load = async () => {
    setError(null)
    try {
      const [prefs, prods] = await Promise.all([
        api.productPreferences.listByCustomer(customerId),
        api.products.list(),
      ])
      setPreferences(prefs)
      setProducts(prods)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load preferences')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [customerId])

  const preferredIds = useMemo(() => new Set(preferences.map((p) => p.productId)), [preferences])

  const productOptions = useMemo(
    () =>
      products
        .filter((p) => p.id === selectedProductId || !preferredIds.has(p.id))
        .map((p) => ({ value: p.id, label: p.name })),
    [products, preferredIds, selectedProductId]
  )

  const selectedProduct = products.find((p) => p.id === (editing?.productId ?? selectedProductId))

  const save = async () => {
    setError(null)
    const productId = editing?.productId ?? selectedProductId
    if (productId === null) {
      setError('Select a product')
      return
    }
    const preferencePrice = price.trim() === '' ? null : moneyToCents(price)
    if (preferencePrice !== null && preferencePrice < 0) {
      setError('Price cannot be negative')
      return
    }
    setSaving(true)
    try {
      await api.productPreferences.set({ customerId, productId, preferencePrice })
      onSaved(
        preferencePrice === null
          ? 'Product marked as a previous buyer for this customer.'
          : `Preference saved — this customer's lines will autofill at ${formatMoney(preferencePrice)}.`
      )
      setEditing(null)
      setSelectedProductId(null)
      setPrice('')
      setAdding(false)
      setSaving(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save preference')
      setSaving(false)
    }
  }

  const remove = async (pref: CustomerProductPreference) => {
    setError(null)
    try {
      await api.productPreferences.remove(customerId, pref.productId)
      onSaved(`Removed "${pref.productName}" from this customer's preferences.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove preference')
    }
  }

  const startEditing = (pref: CustomerProductPreference) => {
    setEditing(pref)
    setPrice(pref.preferencePrice === null ? '' : (pref.preferencePrice / 100).toFixed(2))
    setAdding(false)
  }

  return (
    <div className="overlay">
      <div className="modal modal-wide">
        <div className="modal-header">
          <h3>Product Preferences</h3>
          <span className="muted fine-text">{customerName}</span>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="pref-form">
          {adding || editing ? (
            <div className="form-grid form-grid-3">
              {editing ? (
                <label className="field">
                  <span>Product</span>
                  <input value={editing.productName} disabled />
                </label>
              ) : (
                <label className="field">
                  <span>Product</span>
                  <SearchSelect
                    options={productOptions}
                    value={selectedProductId}
                    onChange={setSelectedProductId}
                    placeholder="Select product…"
                  />
                </label>
              )}
              <label className="field">
                <span>Preference price (Rs.)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  autoFocus={!adding}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <div className="field pref-form-actions">
                {selectedProduct && (
                  <small className="muted fine-text">
                    Minimum rate {formatMoney(selectedProduct.rate)}
                  </small>
                )}
                <div className="detail-actions">
                  <button className="btn ghost small" onClick={() => {
                    setEditing(null)
                    setSelectedProductId(null)
                    setPrice('')
                    setAdding(false)
                  }}>
                    Cancel
                  </button>
                  <button className="btn primary small" onClick={() => void save()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="form-actions">
              <button className="btn ghost" onClick={() => { setEditing(null); setAdding(true) }}>
                + Add preference
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="placeholder"><h3>Loading preferences…</h3></div>
        ) : preferences.length === 0 ? (
          <div className="empty-state">
            <p>No preferred products yet. They are added automatically the first time this customer buys a product.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Preference price</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {preferences.map((pref) => (
                  <tr key={pref.productId}>
                    <td>{pref.productName}</td>
                    <td className="mono">
                      {pref.preferencePrice === null ? '—' : formatMoney(pref.preferencePrice)}
                    </td>
                    <td className="table-actions">
                      <button className="btn ghost small" onClick={() => startEditing(pref)}>
                        Edit
                      </button>
                      <button
                        className="btn danger ghost small"
                        onClick={() => void remove(pref)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-actions">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}