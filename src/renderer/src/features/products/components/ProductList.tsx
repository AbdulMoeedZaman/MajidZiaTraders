import { useMemo, useState } from 'react'
import { useProducts } from '../hooks/useProducts'
import { ProductForm } from './ProductForm'
import { RestockModal } from './RestockModal'
import { InventoryView } from './InventoryView'
import { formatMoney } from '../../../lib/format'
import { api } from '../../../lib/api'
import type { Product } from '@shared/types/product'

interface Props {
  onOpen?: (id: number) => void
}

export function ProductList({ onOpen }: Props) {
  const { products, loading, error, reload, create, update, remove } = useProducts()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showRestock, setShowRestock] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)

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

  const handleRestock = async (data: { productId: number; quantity: number }) => {
    const product = products.find((p) => p.id === data.productId)
    await api.stock.restock(data)
    setSuccess(`Added ${data.quantity} cartons to ${product?.name ?? 'product'}`)
    window.setTimeout(() => setSuccess(null), 3000)
  }

  const handleImportCsv = async () => {
    setFormError(null)
    setImportMessage(null)
    try {
      const pick = await api.dialogs.openCsv()
      if (pick.canceled || !pick.path) return
      const result = await api.products.importCsv(pick.path)
      const parts = [`Imported ${result.created} product${result.created === 1 ? '' : 's'}`]
      if (result.skippedDuplicate > 0) parts.push(`${result.skippedDuplicate} skipped (already exist)`)
      if (result.skippedInvalid > 0) parts.push(`${result.skippedInvalid} skipped (invalid rows)`)
      setImportMessage(parts.join(' · '))
      await reload()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to import CSV')
    }
  }

  if (loading) return <div className="placeholder"><h3>Loading products…</h3></div>
  if (error) return <div className="error-screen">{error}</div>

  if (showInventory) return <InventoryView onBack={() => setShowInventory(false)} />

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
        <button className="btn ghost" onClick={() => setShowRestock(true)}>
          Restock
        </button>
        <button className="btn ghost" onClick={() => setShowInventory(true)}>
          Inventory
        </button>
        <button className="btn ghost" onClick={() => setShowAdd(true)}>
          + Add Product
        </button>
        <button className="btn ghost" onClick={() => void handleImportCsv()}>
          Import CSV…
        </button>
      </div>

      {formError && <div className="form-error">{formError}</div>}
      {success && <div className="form-success">{success}</div>}
      {importMessage && <div className="text-ok fine-text">{importMessage}</div>}

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
                <tr key={p.id} className="clickable" onClick={() => onOpen?.(p.id)}>
                  <td>{p.name}</td>
                  <td className="num mono">{formatMoney(p.rate)}</td>
                  <td className="num">{p.boxesPerCarton}</td>
                  <td className="actions-col" onClick={(e) => e.stopPropagation()}>
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

      {showRestock && (
        <RestockModal
          products={products}
          onConfirm={handleRestock}
          onCancel={() => setShowRestock(false)}
        />
      )}
    </div>
  )
}