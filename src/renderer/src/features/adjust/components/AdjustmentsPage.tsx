import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { formatDate, formatMoney } from '../../../lib/format'
import { SearchSelect } from '../../../components/SearchSelect'
import type { Product } from '@shared/types/product'
import type { StockLevel } from '@shared/types/stock'
import type { RecentPayment } from '@shared/types/payment'

type Tab = 'stock' | 'payments'

export function AdjustmentsPage() {
  const [tab, setTab] = useState<Tab>('stock')

  return (
    <div className="feature">
      <div className="toolbar">
        <div className="segmented">
          <button className={tab === 'stock' ? 'active' : ''} onClick={() => setTab('stock')}>
            Stock Adjustments
          </button>
          <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>
            Payment Adjustments
          </button>
        </div>
        <div className="spacer" />
      </div>

      {tab === 'stock' ? <StockAdjustTab /> : <PaymentAdjustTab />}
    </div>
  )
}

function StockAdjustTab() {
  const [products, setProducts] = useState<Product[]>([])
  const [levels, setLevels] = useState<StockLevel[]>([])
  const [productId, setProductId] = useState<number | null>(null)
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [cartons, setCartons] = useState('')
  const [loosePieces, setLoosePieces] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [prod, stock] = await Promise.all([api.products.list(), api.stock.levels()])
      setProducts(prod)
      setLevels(stock)
      setProductId((current) => current ?? prod[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stock')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const selectedLevel = levels.find((l) => l.productId === productId)?.quantity ?? 0

  const submit = async () => {
    setError(null)
    setSuccess(null)
    if (productId === null) {
      setError('Select a product')
      return
    }
    const ctn = Number(cartons)
    const loose = Number(loosePieces)
    if (cartons !== '' && (!Number.isInteger(ctn) || ctn < 0)) {
      setError('Cartons must be a whole number of at least 0')
      return
    }
    if (loosePieces !== '' && (!Number.isInteger(loose) || loose < 0)) {
      setError('Loose pieces must be a whole number of at least 0')
      return
    }
    const ctnValue = Number.isInteger(ctn) ? ctn : 0
    const looseValue = Number.isInteger(loose) ? loose : 0
    if (ctnValue === 0 && looseValue === 0) {
      setError('Enter cartons or loose pieces to adjust')
      return
    }
    const product = products.find((p) => p.id === productId)
    setSaving(true)
    try {
      await api.stock.adjust({
        productId,
        cartons: ctnValue,
        loosePieces: looseValue,
        remove: mode === 'remove',
        note: note.trim() || null,
      })
      const parts: string[] = []
      if (ctnValue > 0) parts.push(`${ctnValue} cartons`)
      if (looseValue > 0) parts.push(`${looseValue} pcs`)
      setSuccess(
        `${mode === 'remove' ? 'Removed' : 'Added'} ${parts.join(' + ')} for "${product?.name ?? 'product'}"`
      )
      setCartons('')
      setLoosePieces('')
      setNote('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to adjust stock')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}

      <section className="section-card">
        <div className="section-title">Correct a stock entry</div>
        <p className="muted fine-text">
          Add or remove stock to fix a mistaken restock, sale or entry. The change is recorded as
          an adjustment on the stock ledger.
        </p>
        <div className="form-grid">
          <label className="field field-span-2">
            <span>Product</span>
            <SearchSelect
              options={products.map((p) => {
                const level = levels.find((l) => l.productId === p.id)?.quantity ?? 0
                const bpc = Math.max(1, p.piecesPerCarton)
                return {
                  value: p.id,
                  label: p.name,
                  hint: `${Math.floor(level / bpc)} ctn + ${level % bpc} pcs (${level} pcs)`,
                }
              })}
              value={productId}
              onChange={setProductId}
              placeholder="Select product…"
              allowClear={false}
            />
          </label>

          <div className="field field-span-2">
            <span>Action</span>
            <div className="segmented">
              <button
                className={mode === 'add' ? 'active' : ''}
                onClick={() => setMode('add')}
              >
                Add stock
              </button>
              <button
                className={mode === 'remove' ? 'active' : ''}
                onClick={() => setMode('remove')}
              >
                Remove stock
              </button>
            </div>
          </div>

          <label className="field">
            <span>Cartons</span>
            <input
              type="number"
              min="0"
              step="1"
              value={cartons}
              onChange={(e) => setCartons(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="field">
            <span>Loose pcs</span>
            <input
              type="number"
              min="0"
              step="1"
              value={loosePieces}
              onChange={(e) => setLoosePieces(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="field field-span-2">
            <span>Reason (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. entered 5 cartons instead of 3 yesterday"
            />
          </label>
        </div>
        <div className="form-actions">
          <span className="muted fine-text">
            Current balance: {selectedLevel} pcs
          </span>
          <button className="btn primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Adjusting…' : mode === 'remove' ? 'Remove Stock' : 'Add Stock'}
          </button>
        </div>
      </section>

      <section className="section-card">
        <div className="section-title">Current stock levels</div>
        {levels.length === 0 ? (
          <p className="muted fine-text">No stock recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Cartons</th>
                  <th className="num">Loose pcs</th>
                  <th className="num">Total pcs</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((l) => {
                  const product = products.find((p) => p.id === l.productId)
                  const bpc = Math.max(1, product?.piecesPerCarton ?? 1)
                  return (
                    <tr
                      key={l.productId}
                      className={l.productId === productId ? 'selected' : undefined}
                      onClick={() => setProductId(l.productId)}
                    >
                      <td>{l.productName}</td>
                      <td className="num mono">{Math.floor(l.quantity / bpc)}</td>
                      <td className="num mono">{l.quantity % bpc}</td>
                      <td className="num mono">{l.quantity.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function PaymentAdjustTab() {
  const [payments, setPayments] = useState<RecentPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPayments(await api.payments.listRecent(100))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleRemove = async (payment: RecentPayment) => {
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      await api.payments.remove(payment.id)
      setConfirmId(null)
      setSuccess(
        `Removed ${formatMoney(payment.amount)} received against ${payment.invoiceNumber}`
      )
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove payment')
      setConfirmId(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}

      <section className="section-card">
        <div className="section-title">Correct a recorded payment</div>
        <p className="muted fine-text">
          Removing a payment reverses it — the invoice's paid amount and status are recalculated
          automatically, and the removal is recorded in the action log.
        </p>
      </section>

      {loading ? (
        <div className="placeholder">
          <h3>Loading payments…</h3>
        </div>
      ) : payments.length === 0 ? (
        <div className="empty-state">
          <h3>No payments recorded yet</h3>
          <p>Payments received against invoices will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th className="num">Amount</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td className="mono">{p.invoiceNumber}</td>
                  <td>{p.customerName}</td>
                  <td className="num mono">{formatMoney(p.amount)}</td>
                  <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                    {confirmId === p.id ? (
                      <span className="confirm-bar">
                        <button
                          className="btn danger small"
                          disabled={busy}
                          onClick={() => void handleRemove(p)}
                        >
                          Confirm
                        </button>
                        <button className="btn ghost small" onClick={() => setConfirmId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button className="btn danger small" onClick={() => setConfirmId(p.id)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}