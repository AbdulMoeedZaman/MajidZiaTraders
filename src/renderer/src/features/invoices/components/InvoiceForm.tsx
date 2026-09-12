import { useMemo, useState } from 'react'
import type { Broker } from '@shared/types/broker'
import type { Product } from '@shared/types/product'
import type { Customer } from '@shared/types/customer'
import { formatMoney } from '../../../lib/format'
import { countToInt, moneyToCents } from '../../../lib/money'
import { calculateLineAmount } from '@shared/calc/invoice-totals'

export interface InvoiceFormValues {
  customerId: number | null
  brokerId: number | null
  filerStatus: 'filer' | 'non_filer'
  remaining: string
  tax: string
  grandTotal: string
  items: Array<{
    productId: number | null
    rate: string
    cartonCount: string
    boxCount: string
  }>
}

interface Props {
  customers: Customer[]
  brokers: Broker[]
  products: Product[]
  preselectCustomerId?: number | null
  onSubmit: (values: InvoiceFormValues) => Promise<void>
}

function emptyLine() {
  return { productId: null as number | null, rate: '', cartonCount: '', boxCount: '' }
}

export function InvoiceForm({ customers, brokers, products, preselectCustomerId, onSubmit }: Props) {
  const [customerId, setCustomerId] = useState<number | null>(preselectCustomerId ?? null)
  const [brokerId, setBrokerId] = useState<number | null>(null)
  const [filerStatus, setFilerStatus] = useState<'filer' | 'non_filer'>('filer')
  const [items, setItems] = useState(() => [emptyLine()])
  const [remaining, setRemaining] = useState('')
  const [tax, setTax] = useState('')
  const [grandTotal, setGrandTotal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const productById = useMemo(() => {
    const map = new Map<number, Product>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  const subtotal = useMemo(() => {
    let total = 0
    for (const line of items) {
      if (line.productId === null) continue
      const product = productById.get(line.productId)
      if (!product) continue
      total += calculateLineAmount({
        rate: moneyToCents(line.rate),
        boxesPerCarton: product.boxesPerCarton,
        cartonCount: countToInt(line.cartonCount),
        boxCount: countToInt(line.boxCount),
      })
    }
    return total
  }, [items, productById])

  const setLine = (index: number, patch: Partial<InvoiceFormValues['items'][number]>) => {
    setItems((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const lineAmount = (index: number): number => {
    const line = items[index]
    if (line.productId === null) return 0
    const product = productById.get(line.productId)
    if (!product) return 0
    return calculateLineAmount({
      rate: moneyToCents(line.rate),
      boxesPerCarton: product.boxesPerCarton,
      cartonCount: countToInt(line.cartonCount),
      boxCount: countToInt(line.boxCount),
    })
  }

  const lineError = (index: number): string | null => {
    const line = items[index]
    if (line.productId === null) return null
    const product = productById.get(line.productId)
    if (!product) return null
    const rateCents = moneyToCents(line.rate)
    if (rateCents < product.rate) {
      return `Cannot go below minimum rate ${formatMoney(product.rate)}`
    }
    if (countToInt(line.cartonCount) + countToInt(line.boxCount) === 0) {
      return 'Enter cartons or boxes'
    }
    return null
  }

  const submit = async () => {
    setError(null)
    if (customerId === null) {
      setError('Select a customer')
      return
    }
    if (brokerId === null) {
      setError('Select a booker')
      return
    }
    const validLines = items.filter((l) => l.productId !== null)
    if (validLines.length === 0) {
      setError('Add at least one product line')
      return
    }
    for (let i = 0; i < items.length; i++) {
      if (items[i].productId === null) continue
      const err = lineError(i)
      if (err) {
        setError(`Line ${i + 1}: ${err}`)
        return
      }
    }
    setSaving(true)
    try {
      await onSubmit({
        customerId,
        brokerId,
        filerStatus,
        remaining,
        tax,
        grandTotal,
        items: validLines.map((l) => ({
          productId: l.productId,
          rate: l.rate,
          cartonCount: l.cartonCount,
          boxCount: l.boxCount,
        })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save invoice')
      setSaving(false)
    }
  }

  return (
    <div className="feature">
      <div className="form-grid form-grid-3">
        <label className="field">
          <span>Customer</span>
          <select
            value={customerId ?? ''}
            onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.shopName || c.ownerName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Booker</span>
          <select
            value={brokerId ?? ''}
            onChange={(e) => setBrokerId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select booker…</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field toggle-field">
          <span>Filer</span>
          <button
            type="button"
            role="switch"
            aria-checked={filerStatus === 'filer'}
            className={`toggle-switch ${filerStatus === 'filer' ? 'on' : ''}`}
            onClick={() => setFilerStatus((prev) => (prev === 'filer' ? 'non_filer' : 'filer'))}
          >
            <span className="toggle-knob" />
          </button>
          <small className="toggle-hint">{filerStatus === 'filer' ? 'Filer' : 'Non Filer'}</small>
        </div>
      </div>

      <div className="section-title">Items</div>
      {items.map((line, i) => {
        const product = line.productId !== null ? productById.get(line.productId) : undefined
        return (
          <div className="invoice-line" key={i}>
            <label className="field line-product">
              <span>Product</span>
              <select
                value={line.productId ?? ''}
                onChange={(e) => {
                  const pid = e.target.value ? Number(e.target.value) : null
                  const p = pid !== null ? productById.get(pid) : undefined
                  setLine(i, {
                    productId: pid,
                    rate: p ? (p.rate / 100).toFixed(2) : line.rate,
                  })
                }}
              >
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field line-qty">
              <span>Rate (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.rate}
                onChange={(e) => setLine(i, { rate: e.target.value })}
                placeholder={product ? (product.rate / 100).toFixed(2) : '0.00'}
              />
            </label>
            <label className="field line-qty">
              <span>Carton no.</span>
              <input
                type="number"
                min="0"
                step="1"
                value={line.cartonCount}
                onChange={(e) => setLine(i, { cartonCount: e.target.value })}
              />
            </label>
            <label className="field line-qty">
              <span>Box no.</span>
              <input
                type="number"
                min="0"
                step="1"
                value={line.boxCount}
                onChange={(e) => setLine(i, { boxCount: e.target.value })}
              />
            </label>
            <div className="line-total">
              <span>Amount</span>
              <strong className="mono">{formatMoney(lineAmount(i))}</strong>
            </div>
            <button
              type="button"
              className="btn danger ghost small line-remove"
              onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
            >
              ✕
            </button>
            {lineError(i) && <div className="line-hint text-danger">{lineError(i)}</div>}
          </div>
        )
      })}
      <div className="form-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setItems((prev) => [...prev, emptyLine()])}
        >
          + Add line
        </button>
      </div>

      <div className="section-title">Totals</div>
      <div className="totals-card">
        <div className="totals-row">
          <span>Subtotal (automatic)</span>
          <strong className="mono">{formatMoney(subtotal)}</strong>
        </div>
        <div className="totals-row">
          <span>Remaining amount (manual)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={remaining}
            onChange={(e) => setRemaining(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="totals-row">
          <span>Tax (manual)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="totals-row">
          <span>Grand total (manual)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={grandTotal}
            onChange={(e) => setGrandTotal(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="detail-actions">
        <button className="btn primary" onClick={() => void submit()} disabled={saving}>
          {saving ? 'Saving…' : 'Save Invoice'}
        </button>
      </div>
    </div>
  )
}