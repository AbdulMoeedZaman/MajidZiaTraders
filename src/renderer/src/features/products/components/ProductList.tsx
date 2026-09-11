import { useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { Product } from '@shared/types/product'
import { useProducts, CatalogFilter } from '../hooks/useProducts'
import { useCategories } from '../hooks/useCategories'
import { ProductForm } from './ProductForm'
import { ProductDetail } from './ProductDetail'
import { AddStockModal } from './AddStockModal'
import { StockHistoryModal } from './StockHistoryModal'
import { CategoryManager } from './CategoryManager'
import { formatMoney } from '../../../lib/format'
import { ProductFormMode } from '../types/product-form'

export function ProductList() {
  const {
    products,
    visible,
    loading,
    error,
    filter,
    setFilter,
    query,
    setQuery,
    createProduct,
    updateProduct,
    setProductActive,
    deleteProduct,
    addStock,
  } = useProducts()
  const { categories, categoryName, createCategory, renameCategory, setCategoryActive, deleteCategory } =
    useCategories()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
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

  const handleToggleActive = async (p: ProductWithStock) => {
    setActionError(null)
    const err = await setProductActive(p.id, p.isActive !== 1)
    if (err) setActionError(err)
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
        <div className="segmented">
          {(['all', 'active', 'inactive'] as CatalogFilter[]).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setCategoriesOpen(true)}>
          Categories
        </button>
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
                  <th>Category</th>
                  <th className="num">Selling price</th>
                  <th className="num">Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
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
                    <td>{categoryName(p.categoryId)}</td>
                    <td className="num">{formatMoney(p.sellingPrice)}</td>
                    <td className="num">
                      <span className={p.isOutOfStock ? 'text-danger' : p.isLowStock ? 'text-warn' : ''}>
                        {p.currentStock}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${p.isActive === 1 ? 'ok' : 'muted-badge'}`}>
                        {p.isActive === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <ProductDetail
              product={selected}
              categoryName={categoryName(selected.categoryId)}
              onEdit={() => setForm({ mode: 'edit', product: selected })}
              onToggleActive={handleToggleActive}
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
            categories={categories}
            onSubmit={handleFormSubmit}
            onCancel={() => setForm(null)}
          />
        </Modal>
      )}

      {addStockFor && (
        <Modal title={`Add Stock · ${addStockFor.name}`} onClose={() => setAddStockFor(null)}>
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

      {categoriesOpen && (
        <Modal title="Categories" onClose={() => setCategoriesOpen(false)}>
          <CategoryManager
            categories={categories}
            onCreate={createCategory}
            onRename={renameCategory}
            onSetActive={setCategoryActive}
            onDelete={deleteCategory}
            onClose={() => setCategoriesOpen(false)}
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