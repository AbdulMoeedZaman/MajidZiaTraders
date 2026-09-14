import { useEffect, useMemo, useRef, useState } from 'react'
import type { Broker } from '@shared/types/broker'
import type { Product } from '@shared/types/product'
import type { Customer } from '@shared/types/customer'
import type { Route } from '@shared/types/route'
import { SearchSelect, type SearchSelectHandle } from '../../../components/SearchSelect'
import { formatMoney } from '../../../lib/format'
import { countToInt, moneyToCents } from '../../../lib/money'
import { calculateLineAmount, roundToTen } from '@shared/calc/invoice-totals'

export interface InvoiceFormValues {
  customerId: number | null
  brokerId: number | null
  filerStatus: 'filer' | 'non_filer'
  tax: string
  items: Array<{
    productId: number | null
    rate: string
    cartonCount: string
    boxCount: string
  }>
}

interface Props {
  routes: Route[]
  customers: Customer[]
  brokers: Broker[]
  products: Product[]
  /** Current stock per product id (used to block negative stock). */
  stockLevels: Record<number, number>
  preselectCustomerId?: number | null
  onSubmit: (values: InvoiceFormValues) => Promise<void>
}

function emptyLine() {
  return { productId: null as number | null, rate: '', cartonCount: '', boxCount: '' }
}

export function InvoiceForm({ routes, customers, brokers, products, stockLevels, preselectCustomerId, onSubmit }: Props) {
  const [routeId, setRouteId] = useState<number | null>(null)
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [brokerId, setBrokerId] = useState<number | null>(null)
  const [filerStatus, setFilerStatus] = useState<'filer' | 'non_filer'>('filer')
  const [items, setItems] = useState(() => [emptyLine()])
  const [tax, setTax] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const productRefs = useRef<Array<SearchSelectHandle | null>>([])
  const rateRefs = useRef<Array<HTMLInputElement | null>>([])
  const cartonRefs = useRef<Array<HTMLInputElement | null>>([])
  const boxRefs = useRef<Array<HTMLInputElement | null>>([])
  const [pendingProductFocus, setPendingProductFocus] = useState<number | null>(null)

  // When opened from a customer's "New Invoice" button, preselect both the
  // customer and its delivery route so the customer list matches it.
  useEffect(() => {
    if (preselectCustomerId == null) return
    const customer = customers.find((c) => c.id === preselectCustomerId)
    if (!customer) return
    setCustomerId(customer.id)
    setRouteId(customer.routeId)
  }, [preselectCustomerId, customers])

  const routeName = (routeId: number): string =>
    routes.find((r) => r.id === routeId)?.name ?? ''

  const routeOptions = useMemo(
    () => routes.map((r) => ({ value: r.id, label: r.name })),
    [routes]
  )

  const customerOptions = useMemo(() => {
    const onRoute = routeId === null ? customers : customers.filter((c) => c.routeId === routeId)
    return onRoute.map((c) => ({
      value: c.id,
      label: `${c.code} — ${c.shopName || c.ownerName}`,
      hint: routeName(c.routeId),
    }))
  }, [customers, routeId, routeName])

  const handleRouteChange = (id: number | null) => {
    setRouteId(id)
    if (id !== null && customerId !== null) {
      const customer = customers.find((c) => c.id === customerId)
      if (customer && customer.routeId !== id) setCustomerId(null)
    }
  }

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

  // Grand total = subtotal + manually entered tax; remaining = grand total
  // minus recorded payments (a freshly created invoice has none, so it starts
  // at the full grand total and shrinks as payments are applied later). The tax
  // is rounded to the nearest ten paisa exactly as the backend stores it, so the
  // preview can never disagree with the saved invoice.
  const taxCents = tax.trim() === '' ? null : roundToTen(moneyToCents(tax))
  const grandTotal = subtotal + (taxCents ?? 0)
  const remaining = grandTotal

  const setLine = (index: number, patch: Partial<InvoiceFormValues['items'][number]>) => {
    setItems((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  // After a new line renders, move focus into its product search so the user can
  // immediately start typing the next product.
  useEffect(() => {
    if (pendingProductFocus === null) return
    productRefs.current[pendingProductFocus]?.open()
    setPendingProductFocus(null)
  }, [pendingProductFocus, items.length])

  const focusRate = (index: number) => rateRefs.current[index]?.focus()
  const focusCarton = (index: number) => cartonRefs.current[index]?.focus()
  const focusBox = (index: number) => boxRefs.current[index]?.focus()

  const handleBoxEnter = (index: number) => {
    const line = items[index]
    const next = items[index + 1]
    if (line.productId === null) {
      productRefs.current[index]?.open()
      return
    }
    if (next && next.productId === null) {
      setPendingProductFocus(index + 1)
      return
    }
    if (index === items.length - 1) {
      setItems((prev) => [...prev, emptyLine()])
      setPendingProductFocus(index + 1)
      return
    }
    setPendingProductFocus(index + 1)
  }

  const handleProductSelected = (index: number) => {
    focusRate(index)
  }

  // A product already used on another line is hidden from this line's picker,
  // so the same product cannot be billed twice.
  const usedProductIds = useMemo(
    () =>
      items
        .map((l) => l.productId)
        .filter((id): id is number => id !== null)
        .reduce<number[]>((acc, id) => (acc.includes(id) ? acc : [...acc, id]), []),
    [items]
  )

  const productOptions = (index: number, product: Product | undefined) =>
    products
      .filter((p) => p.id === product?.id || !usedProductIds.includes(p.id))
      .map((p) => ({ value: p.id, label: p.name }))

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
    const quantity =
      countToInt(line.cartonCount) * product.boxesPerCarton + countToInt(line.boxCount)
    if (quantity === 0) {
      return 'Enter cartons or boxes'
    }
    const stock = stockLevels[line.productId] ?? 0
    if (quantity > stock) {
      return `Only ${stock} pcs in stock — requested ${quantity} pcs`
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
        tax,
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
      <div className="form-grid form-grid-4">
        <label className="field">
          <span>Route</span>
          <SearchSelect
            options={routeOptions}
            value={routeId}
            onChange={handleRouteChange}
            placeholder="All routes"
            allowClear
          />
        </label>
        <label className="field">
          <span>Customer</span>
          <SearchSelect
            options={customerOptions}
            value={customerId}
            onChange={setCustomerId}
            placeholder="Select customer…"
            emptyText={routeId === null ? 'No customers' : 'No customers on this route'}
            allowClear
          />
        </label>
        <label className="field">
          <span>Booker</span>
          <SearchSelect
            options={brokers.map((b) => ({ value: b.id, label: b.name }))}
            value={brokerId}
            onChange={setBrokerId}
            placeholder="Select booker…"
            allowClear
          />
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
              <SearchSelect
                ref={(handle) => {
                  productRefs.current[i] = handle
                }}
                options={productOptions(i, product)}
                value={line.productId}
                onChange={(pid) => {
                  const p = pid !== null ? productById.get(pid) : undefined
                  setLine(i, {
                    productId: pid,
                    rate: p ? (p.rate / 100).toFixed(2) : line.rate,
                  })
                  if (pid !== null) handleProductSelected(i)
                }}
                placeholder="Select product…"
                allowClear
              />
            </label>
            <label className="field line-qty">
              <span>Rate (Rs.)</span>
              <input
                ref={(el) => {
                  rateRefs.current[i] = el
                }}
                type="number"
                min="0"
                step="0.01"
                value={line.rate}
                onChange={(e) => setLine(i, { rate: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') focusCarton(i)
                }}
                placeholder={product ? (product.rate / 100).toFixed(2) : '0.00'}
              />
            </label>
            <label className="field line-qty">
              <span>Carton no.</span>
              <input
                ref={(el) => {
                  cartonRefs.current[i] = el
                }}
                type="number"
                min="0"
                step="1"
                value={line.cartonCount}
                onChange={(e) => setLine(i, { cartonCount: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') focusBox(i)
                }}
              />
            </label>
            <label className="field line-qty">
              <span>Box no.</span>
              <input
                ref={(el) => {
                  boxRefs.current[i] = el
                }}
                type="number"
                min="0"
                step="1"
                value={line.boxCount}
                onChange={(e) => setLine(i, { boxCount: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleBoxEnter(i)
                }}
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
            {product && (
              <div className="line-hint muted fine-text">
                In stock: {(stockLevels[product.id] ?? 0)} pcs
                {' '}({Math.floor((stockLevels[product.id] ?? 0) / Math.max(1, product.boxesPerCarton))} ctn +{' '}
                {(stockLevels[product.id] ?? 0) % Math.max(1, product.boxesPerCarton)} loose)
              </div>
            )}
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
          <span>Grand total (automatic)</span>
          <strong className="mono">{formatMoney(grandTotal)}</strong>
        </div>
        <div className="totals-row">
          <span>Remaining amount (automatic)</span>
          <strong className="mono">{formatMoney(remaining)}</strong>
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