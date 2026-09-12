import { useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { Product } from '@shared/types/product'
import { useProducts } from '../hooks/useProducts'
import { ProductForm } from './ProductForm'
import { ProductDetail } from './ProductDetail'
import { AddStockModal } from './AddStockModal'
import { StockHistoryModal } from './StockHistoryModal'
import { formatMoney } from '../../../lib/format'
import { ProductFormMode } from '../types/product-form'

export function ProductList() {
  const {
    products,
    visible,
    loading,
    error,
    query,
    setQuery,
    createProduct,
    updateProduct,
    deleteProduct,
    addStock,
  } = useProducts()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState<{ mode: ProductFormMode; product: Product | null } | null>(null)
  const [addStockFor, setAddStockFor] = useState<ProductWithStock | null>(null)
  const [historyFor, setHistoryFor] = useState<ProductWithStock | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const selected = selectedId === null ? null : (products.find((p) => p.id === selectedId) ?? null)

  const handleFormSubmit = async (payload: Record<string, unknown>): Promise<string | null> => {
    if (!form) return null
    const err =
      form.mode === 'create'
        ? await createProduct(payload as unknown as Parameters<typeof createProduct>[0])
        : await updateProduct(form.product!.id, payload as unknown as Parameters<typeof updateProduct>[1])
    if (!err) setForm(null)
    return err
  }

  const handleDelete = async (p: ProductWithStock) => {
    setActionError(null)
    const err = await deleteProduct(p.id)
    if (err) setActionError(err)
    else setSelectedId(null)
  }

  return (
    <div className="feature">
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search by name or SKU…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="spacer" />
        <button
          className="btn primary"
          onClick={() => setForm({ mode: 'create', product: null })}
        >
          + Add product
        </button>
      </div>

      {actionError && <div className="form-error">{actionError}</div>}
      {loading ? (
        <div className="muted">Loading…</div>
      ) : error ? (
        <div className="form-error">{error}</div>
      ) : (
        <div className="split">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th className="num">Selling price</th>
                  <th className="num">Stock</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No products found.
                    </td>
                  </tr>
                )}
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    className={selectedId === p.id ? 'selected' : ''}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <td className="mono">{p.sku}</td>
                    <td>{p.name}</td>
                    <td className="num">{formatMoney(p.sellingPrice)}</td>
                    <td className="num">
                      <span className={p.isOutOfStock ? 'text-danger' : ''}>{p.currentStock}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <ProductDetail
              product={selected}
              onEdit={() => setForm({ mode: 'edit', product: selected })}
              onDelete={handleDelete}
              onAddStock={(p) => setAddStockFor(p)}
              onViewHistory={(p) => setHistoryFor(p)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}

      {form && (
        <Modal title={form.mode === 'create' ? 'Add product' : 'Edit product'} onClose={() => setForm(null)}>
          <ProductForm
            mode={form.mode}
            product={form.product}
            onSubmit={handleFormSubmit}
            onCancel={() => setForm(null)}
          />
        </Modal>
      )}

      {addStockFor && (
        <Modal title={`Add stock · ${addStockFor.name}`} onClose={() => setAddStockFor(null)}>
          <AddStockModal
            product={addStockFor}
            onSubmit={addStock}
            onClose={() => setAddStockFor(null)}
          />
        </Modal>
      )}

      {historyFor && (
        <Modal title="Stock history" onClose={() => setHistoryFor(null)}>
          <StockHistoryModal
            productId={historyFor.id}
            productName={historyFor.name}
            onClose={() => setHistoryFor(null)}
          />
        </Modal>
      )}
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close" title="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}