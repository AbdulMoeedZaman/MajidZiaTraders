import { useCallback, useEffect, useState } from 'react'
import type { RestockWithItems, CreateRestockDTO, UpdateRestockDTO } from '@shared/types/restock'
import type { ProductWithStock } from '@shared/types/inventory'
import { api } from '../../../lib/api'
import { useRestocks } from '../hooks/useRestocks'
import { RestockForm } from './RestockForm'
import { RESTOCK_STATUS_LABELS } from '../types/restock-form'
import { formatDate, formatMoney } from '../../../lib/format'

function toDollars(paisa: number): string {
  return (paisa / 100).toFixed(2)
}

interface RestockDetailPageProps {
  restockId: number
  onBack: () => void
}

export function RestockDetailPage({ restockId, onBack }: RestockDetailPageProps) {
  const { updateRestock, markReceived, cancel, deleteRestock } = useRestocks()
  const [restock, setRestock] = useState<RestockWithItems | null>(null)
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [updateCost, setUpdateCost] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.restocks.getWithItems(restockId)
      if (!data) setError('Restock not found')
      else setRestock(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [restockId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api.products
      .listActiveWithStock()
      .then(setProducts)
      .catch(() => setProducts([]))
  }, [])

  const run = async (fn: () => Promise<string | null>): Promise<string | null> => {
    setActionError(null)
    const err = await fn()
    if (err) setActionError(err)
    else {
      setEditing(false)
      setConfirmDelete(false)
      await load()
    }
    return err
  }

  const handleSubmit = (payload: CreateRestockDTO | UpdateRestockDTO) =>
    run(() => updateRestock(restockId, payload))

  if (loading) {
    return (
      <div className="feature">
        <div className="muted">Loading restock…</div>
      </div>
    )
  }

  if (error || !restock) {
    return (
      <div className="feature">
        <div className="form-error">{error ?? 'Restock not found'}</div>
      </div>
    )
  }

  const initialItems = restock.items.map((item) => ({
    productId: String(item.productId),
    qtyCartons: String(item.qtyCartons),
    piecesPerCarton: String(item.piecesPerCarton),
    mrpPerPiece: item.mrpPerPiece != null ? toDollars(item.mrpPerPiece) : '',
    netSalesValueExcl: toDollars(item.netSalesValueExcl),
    tradeDiscountValue: toDollars(item.tradeDiscountValue),
    salesTaxRate: String(item.salesTaxRate),
    advanceTaxRate: String(item.advanceTaxRate),
  }))

  return (
    <div className="feature">
      {actionError && <div className="form-error">{actionError}</div>}

      <div className="detail">
        <div className="detail-header">
          <div>
            <h3>Restock {restock.referenceNumber}</h3>
            <span className="muted">
              {restock.supplierName} · {formatDate(restock.date)}
            </span>
          </div>
          <span
            className={`badge ${
              restock.status === 'received' ? 'ok' : restock.status === 'cancelled' ? 'danger' : 'warn'
            }`}
          >
            {RESTOCK_STATUS_LABELS[restock.status]}
          </span>
        </div>

        <div className="restock-header-fields">
          {restock.supplierInvoiceNo && <span><strong>Invoice:</strong> {restock.supplierInvoiceNo}</span>}
          {restock.supplierRegistrationNo && <span><strong>Supplier reg.:</strong> {restock.supplierRegistrationNo}</span>}
          {restock.buyerNtn && <span><strong>Buyer NTN:</strong> {restock.buyerNtn}</span>}
          {restock.buyerCnic && <span><strong>Buyer CNIC:</strong> {restock.buyerCnic}</span>}
          {restock.dispatchNoteNo && <span><strong>Dispatch note:</strong> {restock.dispatchNoteNo}</span>}
          {restock.salesOrderNo && <span><strong>Sales order:</strong> {restock.salesOrderNo}</span>}
        </div>

        {restock.notes && <p className="fine-text muted">{restock.notes}</p>}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Ctns</th>
              <th className="num">Pcs/ctn</th>
              <th className="num">Net excl.</th>
              <th className="num">Sales tax</th>
              <th className="num">Adv. tax</th>
              <th className="num">Discount</th>
              <th className="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {restock.items.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td className="num">{item.qtyCartons}</td>
                <td className="num">{item.piecesPerCarton}</td>
                <td className="num">{formatMoney(item.netSalesValueExcl)}</td>
                <td className="num">{formatMoney(item.salesTaxAmount)}</td>
                <td className="num">{formatMoney(item.advanceTax)}</td>
                <td className="num">{formatMoney(item.tradeDiscountValue)}</td>
                <td className="num">{formatMoney(item.discountedValueInclusive)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="totals-row">
        <strong>Total payable</strong>
        <strong>{formatMoney(restock.totalCost)}</strong>
      </div>

      <div className="detail-actions">
        {restock.status === 'pending' && (
          <>
            <button className="btn" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              className="btn primary"
              onClick={() => {
                if (window.confirm('Mark this restock as received? Stock will be added (cartons × pieces) and this cannot be undone.')) {
                  void run(() => markReceived(restockId, { updateCost }))
                }
              }}
            >
              Mark received
            </button>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={updateCost}
                onChange={(e) => setUpdateCost(e.target.checked)}
              />
              Update product cost to inclusive per-piece cost
            </label>
            <button
              className="btn"
              onClick={() => {
                if (window.confirm('Cancel this restock order? It cannot be reopened.')) {
                  void run(() => cancel(restockId))
                }
              }}
            >
              Cancel restock
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true)
                  window.setTimeout(() => setConfirmDelete(false), 3000)
                } else {
                  run(() => deleteRestock(restockId))
                }
              }}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
          </>
        )}
        {restock.status === 'cancelled' && (
          <button
            className="btn danger"
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true)
                window.setTimeout(() => setConfirmDelete(false), 3000)
              } else {
                run(() => deleteRestock(restockId))
              }
            }}
          >
            {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        )}
      </div>

      {editing && (
        <Modal title={`Edit ${restock.referenceNumber}`} onClose={() => setEditing(false)}>
          <RestockForm
            products={products}
            initial={{
              supplierName: restock.supplierName,
              date: restock.date,
              notes: restock.notes ?? '',
              supplierInvoiceNo: restock.supplierInvoiceNo ?? '',
              supplierRegistrationNo: restock.supplierRegistrationNo ?? '',
              buyerNtn: restock.buyerNtn ?? '',
              buyerCnic: restock.buyerCnic ?? '',
              dispatchNoteNo: restock.dispatchNoteNo ?? '',
              salesOrderNo: restock.salesOrderNo ?? '',
              items: initialItems,
            }}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(false)}
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