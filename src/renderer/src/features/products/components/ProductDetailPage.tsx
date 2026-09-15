import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { formatMoney, formatStockDate } from '../../../lib/format'
import { exportReportCsv, printReport, type ReportSection } from '../../../lib/report'
import type { Product } from '@shared/types/product'
import type { StockMovementWithProduct } from '@shared/types/stock'

interface Props {
  productId: number
  onBack: () => void
}

function splitUnits(pieces: number, perCarton: number): { cartons: number; boxes: number } {
  const sign = pieces < 0 ? -1 : 1
  const abs = Math.abs(pieces)
  return {
    cartons: sign * Math.floor(abs / perCarton),
    boxes: sign * (abs % perCarton),
  }
}

export function ProductDetailPage({ productId, onBack }: Props) {
  const [product, setProduct] = useState<Product | null>(null)
  const [movements, setMovements] = useState<StockMovementWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [prod, history] = await Promise.all([
        api.products.getById(productId),
        api.stock.listByProduct(productId),
      ])
      setProduct(prod)
      setMovements(history)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load product')
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    void load()
  }, [load])

  const latest = [...movements].sort((a, b) => b.id - a.id)[0]
  const inStock = latest ? latest.newQuantity : null
  const perCarton = product?.piecesPerCarton ?? 1
  const inStockUnits = inStock != null ? splitUnits(inStock, perCarton) : null

  const title = `${product?.name ?? 'Product'} — stock history`
  const sections: ReportSection[] = [
    {
      title: 'Stock history',
      columns: ['Date', 'Customer', 'Price', 'Cartons', 'Pcs'],
      rows: movements.map((m) => {
        const u = splitUnits(m.quantity, perCarton)
        return [
          formatStockDate(m.date),
          m.customerName ?? '—',
          m.price != null ? formatMoney(m.price) : '—',
          String(u.cartons),
          String(u.boxes),
        ]
      }),
    },
  ]

  if (loading) return <div className="placeholder"><h3>Loading product…</h3></div>
  if (error) return <div className="error-screen">{error}</div>
  if (!product) return <div className="error-screen">This product does not exist anymore.</div>

  return (
    <div className="feature">
      <div className="toolbar">
        <div className="spacer" />
        <div className="icon-cluster">
          <button className="btn ghost icon" onClick={() => void load()} title="Refresh">
            ↻
          </button>
        </div>
        <button className="btn ghost" onClick={() => printReport(title, `In stock: ${inStock ?? '—'}`, sections)}>
          Print
        </button>
        <button className="btn ghost" onClick={() => exportReportCsv(title, sections)}>
          Export CSV
        </button>
        <button className="btn ghost" onClick={onBack}>
          Back to Products
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="detail detail-rows">
        <div>
          <h3>{product.name}</h3>
          <div className="customer-meta">
            <div>
              <dt>Minimum rate</dt>
              <dd className="mono">{formatMoney(product.rate)}</dd>
            </div>
            <div>
              <dt>Sales price</dt>
              <dd className="mono">{product.salesPrice != null ? formatMoney(product.salesPrice) : '—'}</dd>
            </div>
            <div>
               <dt>Pieces / carton</dt>
              <dd>{product.piecesPerCarton}</dd>
            </div>
            <div>
              <dt>In stock</dt>
               <dd>{inStock != null && inStockUnits ? `${inStock} pcs (${inStockUnits.cartons} ctn + ${inStockUnits.boxes} pcs)` : '—'}</dd>
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">Stock History</div>

      {movements.length === 0 ? (
        <div className="empty-state">
          <h3>No stock movements yet</h3>
          <p>Restock this product to record its first stock entry.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th className="num">Price</th>
                <th className="num">Cartons</th>
                 <th className="num">Pcs</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const u = splitUnits(m.quantity, perCarton)
                const cls = m.type === 'purchase' ? 'stock-in' : 'stock-out'
                return (
                  <tr key={m.id}>
                    <td>{formatStockDate(m.date)}</td>
                    <td>{m.customerName ?? '—'}</td>
                    <td className="num mono">{m.price != null ? formatMoney(m.price) : '—'}</td>
                    <td className="num">
                      <span className={cls}>{m.type === 'purchase' ? `+${u.cartons}` : String(u.cartons)}</span>
                    </td>
                    <td className="num">
                      <span className={cls}>{m.type === 'purchase' ? `+${u.boxes}` : String(u.boxes)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}