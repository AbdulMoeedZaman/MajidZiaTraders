import type { ProductWithStock } from '@shared/types/inventory'
import { formatMoney, formatDateTime } from '../../../lib/format'

interface ProductDetailProps {
  product: ProductWithStock
  categoryName: string
  onEdit: (product: ProductWithStock) => void
  onToggleActive: (product: ProductWithStock) => void
  onDelete: (product: ProductWithStock) => void
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
  categoryName,
  onEdit,
  onToggleActive,
  onDelete,
  onClose,
}: ProductDetailProps) {
  const sessions = (p: ProductWithStock) => {
    if (p.isOutOfStock) return 'Out of stock'
    if (p.isLowStock) return 'Low stock'
    return 'In stock'
  }

  return (
    <div className="detail">
      <div className="detail-header">
        <div>
          <h3>{product.name}</h3>
          <span className="muted">SKU {product.sku}</span>
        </div>
        <button className="btn ghost icon" onClick={onClose} aria-label="Close" title="Close">
          ✕
        </button>
      </div>

      <div className="detail-stock">
        <span className="stock-qty">{product.currentStock}</span>
        <span className={`badge ${product.isOutOfStock ? 'danger' : product.isLowStock ? 'warn' : 'ok'}`}>
          {sessions(product)}
        </span>
      </div>

      <dl className="detail-rows">
        <div>
          <dt>Category</dt>
          <dd>{categoryName}</dd>
        </div>
        <div>
          <dt>Unit</dt>
          <dd>{product.unit || 'piece'}</dd>
        </div>
        <div>
          <dt>Pieces per carton</dt>
          <dd>{product.piecesPerCarton}</dd>
        </div>
        <div>
          <dt>Base cost price</dt>
          <dd>{formatMoney(product.baseCostPrice)}</dd>
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
          <dt>Reorder level</dt>
          <dd>{product.reorderLevel}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{product.isActive === 1 ? 'Active' : 'Inactive'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(product.createdAt)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatDateTime(product.updatedAt)}</dd>
        </div>
        {product.description && (
          <div className="detail-span">
            <dt>Description</dt>
            <dd>{product.description}</dd>
          </div>
        )}
      </dl>

      <div className="detail-actions">
        <button className="btn" onClick={() => onEdit(product)}>
          Edit
        </button>
        <button className="btn" onClick={() => onToggleActive(product)}>
          {product.isActive === 1 ? 'Deactivate' : 'Reactivate'}
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