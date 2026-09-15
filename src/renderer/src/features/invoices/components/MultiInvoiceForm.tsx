import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Product } from '@shared/types/product'
import { fallbackInvoiceRate } from '@shared/types/product'
import { api } from '../../../lib/api'
import { SearchSelect, type SearchSelectHandle } from '../../../components/SearchSelect'
import { formatMoney } from '../../../lib/format'
import { countToInt, moneyToCents } from '../../../lib/money'
import { calculateLineAmount, roundToTen } from '@shared/calc/invoice-totals'
import { canonicalComposition } from '@shared/stock/stock-breakdown'

export interface MultiInvoiceFormValues {
  filerStatus: 'filer' | 'non_filer'
  tax: string
  items: Array<{
    productId: number | null
    rate: string
    cartons: string
    pieces: string
  }>
}

/** Imperative API so the page's "Next" can validate + save the current form. */
export interface MultiInvoiceFormHandle {
  submit: () => Promise<boolean>
}

interface Props {
  products: Product[]
  /** Current stock per product id (used to block negative stock). */
  stockLevels: Record<number, number>
  /** The customer these lines are being entered for (drives preference pricing + ranking). */
  customerId: number
  onSubmit: (values: MultiInvoiceFormValues) => Promise<void>
}

function emptyLine() {
  return { productId: null as number | null, rate: '', cartons: '', pieces: '' }
}

export const MultiInvoiceForm = forwardRef<MultiInvoiceFormHandle, Props>(function MultiInvoiceForm(
  { products, stockLevels, customerId, onSubmit },
  ref
) {
  const [filerStatus, setFilerStatus] = useState<'filer' | 'non_filer'>('non_filer')
  const [items, setItems] = useState(() => [emptyLine()])
  const [tax, setTax] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [preferencePriceByProduct, setPreferencePriceByProduct] = useState<Map<number, number | null>>(
    () => new Map()
  )
  const productRefs = useRef<Array<SearchSelectHandle | null>>([])
  const rateRefs = useRef<Array<HTMLInputElement | null>>([])
  const qtyRefs = useRef<Array<HTMLInputElement | null>>([])
  const cartonRefs = useRef<Array<HTMLInputElement | null>>([])
  const [pendingProductFocus, setPendingProductFocus] = useState<number | null>(null)

  const productById = useMemo(() => {
    const map = new Map<number, Product>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  // Load the customer's preferred products so the dropdown ranks them first
  // and fresh lines autofill to the agreed (preference) rate.
  useEffect(() => {
    let cancelled = false
    void api.productPreferences.listByCustomer(customerId).then((rows) => {
      if (cancelled) return
      setPreferencePriceByProduct(new Map(rows.map((row) => [row.productId, row.preferencePrice])))
    })
    return () => {
      cancelled = true
    }
  }, [customerId])

  const preferredProductIds = useMemo(() => new Set(preferencePriceByProduct.keys()), [preferencePriceByProduct])

  /** Effective starting rate for a product line for the current customer. */
  const effectiveRate = (product: Product): number =>
    fallbackInvoiceRate({
      preferencePrice: preferencePriceByProduct.get(product.id) ?? null,
      salePrice: product.salesPrice,
      minimumPrice: product.rate,
    })

  const subtotal = useMemo(() => {
    let total = 0
    for (const line of items) {
      if (line.productId === null) continue
      const product = productById.get(line.productId)
      if (!product) continue
      const pcs = countToInt(line.cartons) * product.piecesPerCarton + countToInt(line.pieces)
      if (pcs <= 0) continue
      const c = canonicalComposition(pcs, product.piecesPerCarton)
      total += calculateLineAmount({
        rate: moneyToCents(line.rate),
        piecesPerCarton: product.piecesPerCarton,
        cartonCount: c.cartons,
        boxCount: c.loosePieces,
      })
    }
    return total
  }, [items, productById])

  const taxCents = tax.trim() === '' ? null : roundToTen(moneyToCents(tax))
  const grandTotal = subtotal + (taxCents ?? 0)
  const remaining = grandTotal

  const setLine = (index: number, patch: Partial<MultiInvoiceFormValues['items'][number]>) => {
    setItems((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  // Auto-focus the first product picker when this form mounts (arriving from the
  // booker modal), so the user can start typing the first line immediately.
  useEffect(() => {
    const raf = requestAnimationFrame(() => productRefs.current[0]?.open())
    return () => cancelAnimationFrame(raf)
  }, [])

  // After a new line renders, move focus into its product search so the user can
  // immediately start typing the next product.
  useEffect(() => {
    if (pendingProductFocus === null) return
    productRefs.current[pendingProductFocus]?.open()
    setPendingProductFocus(null)
  }, [pendingProductFocus, items.length])

  const focusRate = (index: number) => rateRefs.current[index]?.focus()
  const focusCartons = (index: number) => cartonRefs.current[index]?.focus()
  const focusPieces = (index: number) => qtyRefs.current[index]?.focus()

  const handleQtyEnter = (index: number) => {
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

  const productOptions = (index: number, product: Product | undefined) => {
    const available = products.filter((p) => p.id === product?.id || !usedProductIds.includes(p.id))
    const preferred = available
      .filter((p) => preferredProductIds.has(p.id))
      .map((p) => ({ value: p.id, label: p.name, hint: 'Previous buyer' }))
    const rest = available
      .filter((p) => !preferredProductIds.has(p.id))
      .map((p) => ({ value: p.id, label: p.name }))
    return [...preferred, ...rest]
  }

  const lineAmount = (index: number): number => {
    const line = items[index]
    if (line.productId === null) return 0
    const product = productById.get(line.productId)
    if (!product) return 0
    const pcs = countToInt(line.cartons) * product.piecesPerCarton + countToInt(line.pieces)
    if (pcs <= 0) return 0
    const c = canonicalComposition(pcs, product.piecesPerCarton)
    return calculateLineAmount({
      rate: moneyToCents(line.rate),
      piecesPerCarton: product.piecesPerCarton,
      cartonCount: c.cartons,
      boxCount: c.loosePieces,
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
    const cartons = countToInt(line.cartons)
    const pieces = countToInt(line.pieces)
    if (cartons === 0 && pieces === 0) {
      return 'Enter cartons or pieces'
    }
    const stock = stockLevels[line.productId] ?? 0
    const pcs = cartons * product.piecesPerCarton + pieces
    if (pcs > stock) {
      return `Only ${stock} pcs in stock — requested ${pcs} pcs`
    }
    return null
  }

  const submit = async (): Promise<boolean> => {
    setError(null)
    const validLines = items.filter((l) => l.productId !== null)
    if (validLines.length === 0) {
      setError('Add at least one product line')
      return false
    }
    for (let i = 0; i < items.length; i++) {
      if (items[i].productId === null) continue
      const err = lineError(i)
      if (err) {
        setError(`Line ${i + 1}: ${err}`)
        return false
      }
    }
    setSaving(true)
    try {
      await onSubmit({
        filerStatus,
        tax,
        items: validLines.map((l) => ({
          productId: l.productId,
          rate: l.rate,
          cartons: l.cartons,
          pieces: l.pieces,
        })),
      })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save invoice')
      return false
    } finally {
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({ submit }), [submit])

  return (
    <div>
      <div className="form-grid form-grid-4">
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
                    rate: p ? (effectiveRate(p) / 100).toFixed(2) : line.rate,
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
                  if (e.key === 'Enter') focusCartons(i)
                }}
                placeholder={product ? (effectiveRate(product) / 100).toFixed(2) : '0.00'}
              />
            </label>
            <label className="field line-qty">
              <span>Cartons</span>
              <input
                ref={(el) => {
                  cartonRefs.current[i] = el
                }}
                type="number"
                min="0"
                step="1"
                value={line.cartons}
                onChange={(e) => setLine(i, { cartons: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') focusPieces(i)
                }}
                placeholder="0"
              />
            </label>
            <label className="field line-qty">
              <span>Pieces</span>
              <input
                ref={(el) => {
                  qtyRefs.current[i] = el
                }}
                type="number"
                min="0"
                step="1"
                value={line.pieces}
                onChange={(e) => setLine(i, { pieces: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQtyEnter(i)
                }}
                placeholder="0"
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
                {' '}({Math.floor((stockLevels[product.id] ?? 0) / Math.max(1, product.piecesPerCarton))} ctn +{' '}
                 {(stockLevels[product.id] ?? 0) % Math.max(1, product.piecesPerCarton)} pcs)
                {(() => {
                  const cartons = countToInt(line.cartons)
                  const pieces = countToInt(line.pieces)
                  if (cartons + pieces === 0) return null
                  const c = canonicalComposition(
                    cartons * product.piecesPerCarton + pieces,
                    product.piecesPerCarton
                  )
                  const overflow = pieces >= product.piecesPerCarton
                  return ` · ${c.cartons} ctn + ${c.loosePieces} pcs${overflow ? ' (pieces auto-converted to cartons)' : ''}`
                })()}
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
      {saving && <div className="text-ok fine-text">Saving invoice…</div>}
    </div>
  )
})