import type { ProductWithStock } from '@shared/types/inventory'
import { formatMoney, formatDateTime } from '../../../lib/format'

interface ProductDetailProps {
  product: ProductWithStock
  onEdit: (product: ProductWithStock) => void
  onDelete: (product: ProductWithStock) => void
  onAddStock: (product: ProductWithStock) => void
  onViewHistory: (product: ProductWithStock) => void
  onClose: () => void
}

const STATUS_PENDING_CONFIRM = new WeakSet<ProductWithStock>()

function confirmDelete(product: ProductWithStock): boolean {
  if (STATUS_PENDING_CONFIRM.has(product)) {
    STATUS_PENDING_CONFIRM.delete(product)
    return true
  }
  STATUS_PENDING_CONFIRM.add(product)
  window.setTimeout(() => STATUS_PENDING_CONFIRM.delete(product), 3000)
  return false
}

export function ProductDetail({
  product,
  onEdit,
  onDelete,
  onAddStock,
  onViewHistory,
  onClose,
}: ProductDetailProps) {
  const stockStatus = product.isOutOfStock ? 'Out of stock' : 'In stock'

  return (
    <div className="detail">
      <div className="detail-header">
        <div>
          <h3>{product.name}</h3>
          <span className="muted">SKU {product.sku}</span>
        </div>
        <div className="icon-cluster">
          <button className="btn ghost icon" onClick={() => onAddStock(product)} aria-label="Add stock" title="Add stock">
            +
          </button>
          <button className="btn ghost icon" onClick={() => onViewHistory(product)} aria-label="Stock history" title="Stock history">
            ◷
          </button>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close" title="Close">
            ✕
          </button>
        </div>
      </div>

      <div className="detail-stock">
        <span className="stock-qty">{product.currentStock}</span>
        <span className={`badge ${product.isOutOfStock ? 'danger' : 'ok'}`}>{stockStatus}</span>
      </div>

      <dl className="detail-rows">
        <div>
          <dt>Pieces per carton</dt>
          <dd>{product.piecesPerCarton}</dd>
        </div>
        <div>
          <dt>Min selling price</dt>
          <dd>{formatMoney(product.minSellingPrice)}</dd>
        </div>
        <div>
          <dt>Selling price</dt>
          <dd>{formatMoney(product.sellingPrice)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(product.createdAt)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatDateTime(product.updatedAt)}</dd>
        </div>
      </dl>

      <div className="detail-actions">
        <button className="btn" onClick={() => onEdit(product)}>
          Edit
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirmDelete(product)) {
              onDelete(product)
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}