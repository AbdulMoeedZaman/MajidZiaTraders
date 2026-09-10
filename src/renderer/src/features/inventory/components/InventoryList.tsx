import { useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { CreateStockAdjustmentDTO } from '@shared/types/stock-adjustment'
import { useInventory, StockFilter } from '../hooks/useInventory'
import { StockAdjustmentForm } from './StockAdjustmentForm'
import { OpeningStockForm } from './OpeningStockForm'
import { MovementHistory } from './MovementHistory'

type ActiveModal =
  | { kind: 'adjust'; product: ProductWithStock }
  | { kind: 'opening'; product: ProductWithStock }
  | { kind: 'history'; product: ProductWithStock }
  | null

export function InventoryList() {
  const {
    visible,
    loading,
    error,
    lowCount,
    outCount,
    filter,
    setFilter,
    query,
    setQuery,
    setOpeningStock,
    adjustStock,
  } = useInventory()

  const [modal, setModal] = useState<ActiveModal>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const runAction = async (fn: () => Promise<string | null>, close: boolean): Promise<string | null> => {
    setActionError(null)
    const err = await fn()
    if (err) {
      setActionError(err)
    } else if (close) {
      setModal(null)
    }
    return err
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
          {(['all', 'low', 'out'] as StockFilter[]).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all'
                ? 'All'
                : f === 'low'
                  ? `Low stock (${lowCount})`
                  : `Out of stock (${outCount})`}
            </button>
          ))}
        </div>
      </div>

      {actionError && <div className="form-error">{actionError}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : error ? (
        <div className="form-error">{error}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th className="num">In stock</th>
                <th className="num">Reorder level</th>
                <th>Status</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No inventory items.
                  </td>
                </tr>
              )}
              {visible.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.sku}</td>
                  <td>{p.name}</td>
                  <td className="num">
                    <strong className={p.isOutOfStock ? 'text-danger' : p.isLowStock ? 'text-warn' : ''}>
                      {p.currentStock}
                    </strong>
                  </td>
                  <td className="num">{p.reorderLevel}</td>
                  <td>
                    {p.isOutOfStock ? (
                      <span className="badge danger">Out of stock</span>
                    ) : p.isLowStock ? (
                      <span className="badge warn">Low stock</span>
                    ) : (
                      <span className="badge ok">In stock</span>
                    )}
                  </td>
                  <td className="actions-col">
                    <button className="btn small" onClick={() => setModal({ kind: 'adjust', product: p })}>
                      Adjust
                    </button>
                    <button className="btn small" onClick={() => setModal({ kind: 'history', product: p })}>
                      History
                    </button>
                    <button className="btn small ghost" onClick={() => setModal({ kind: 'opening', product: p })}>
                      Opening
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>
          {modal.kind === 'adjust' && (
            <StockAdjustmentForm
              product={modal.product}
              onSubmit={(data: CreateStockAdjustmentDTO) =>
                runAction(() => adjustStock(data), true)
              }
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'opening' && (
            <OpeningStockForm
              product={modal.product}
              onSubmit={(productId, quantity) =>
                runAction(() => setOpeningStock(productId, quantity), true)
              }
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'history' && (
            <MovementHistory
              productId={modal.product.id}
              productName={modal.product.name}
              onClose={() => setModal(null)}
            />
          )}
        </Modal>
      )}
    </div>
  )
}

function modalTitle(modal: NonNullable<ActiveModal>): string {
  switch (modal.kind) {
    case 'adjust':
      return `Adjust stock — ${modal.product.name}`
    case 'opening':
      return `Opening stock — ${modal.product.name}`
    case 'history':
      return `Stock history — ${modal.product.name}`
  }
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