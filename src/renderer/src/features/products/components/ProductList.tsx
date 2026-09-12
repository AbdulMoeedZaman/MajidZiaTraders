import { useMemo, useState } from 'react'
import { useProducts } from '../hooks/useProducts'
import { ProductForm } from './ProductForm'
import { formatMoney } from '../../../lib/format'
import type { Product } from '@shared/types/product'

export function ProductList() {
  const { products, loading, error, reload, create, update, remove } = useProducts()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => p.name.toLowerCase().includes(q))
  }, [products, query])

  const handleSave = async (data: { name: string; rate: number; boxesPerCarton: number }) => {
    setFormError(null)
    try {
      if (editing) {
        await update(editing.id, data)
      } else {
        await create(data)
      }
      setEditing(null)
      setShowAdd(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save product')
      throw e
    }
  }

  const handleDelete = async (id: number) => {
    setFormError(null)
    try {
      await remove(id)
      setConfirmId(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to delete product')
      setConfirmId(null)
    }
  }

  if (loading) return <div className="placeholder"><h3>Loading products…</h3></div>
  if (error) return <div className="error-screen">{error}</div>

  return (
    <div className="feature">
      <div className="toolbar">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
        />
        <div className="spacer" />
        <div className="icon-cluster">
          <button className="btn ghost icon" onClick={() => void reload()} title="Refresh">
            ↻
          </button>
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          + Add Product
        </button>
      </div>

      {formError && <div className="form-error">{formError}</div>}

      {visible.length === 0 ? (
        <div className="empty-state">
          <h3>No products yet</h3>
          <p>Add a product to start creating invoices.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Minimum rate</th>
                <th className="num">Boxes / carton</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="num mono">{formatMoney(p.rate)}</td>
                  <td className="num">{p.boxesPerCarton}</td>
                  <td className="actions-col">
                    {confirmId === p.id ? (
                      <span className="confirm-bar">
                        <button className="btn danger small" onClick={() => void handleDelete(p.id)}>
                          Confirm
                        </button>
                        <button className="btn ghost small" onClick={() => setConfirmId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <>
                        <button className="btn ghost small" onClick={() => setEditing(p)}>
                          Edit
                        </button>
                        <button className="btn danger small" onClick={() => setConfirmId(p.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <ProductForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => {
            setShowAdd(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}