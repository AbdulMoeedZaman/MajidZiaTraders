import { useMemo, useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { CustomerWithBalance } from '@shared/types/customer'
import type { CreateInvoiceDTO } from '@shared/types/invoice'
import { calculateInvoiceTotals } from '@shared/calc/invoice-totals'
import { InvoiceFormState, InvoiceItemInput, defaultInvoiceFormState, moneyToCents } from '../types/invoice-form'
import { formatMoney } from '../../../lib/format'

interface InvoiceFormProps {
  customers: CustomerWithBalance[]
  products: ProductWithStock[]
  onCustomerChange?: (customer: CustomerWithBalance | undefined) => void
  onSubmit: (payload: CreateInvoiceDTO) => Promise<string | null>
  onCancel: () => void
}

export function InvoiceForm({ customers, products, onCustomerChange, onSubmit, onCancel }: InvoiceFormProps) {
  const [state, setState] = useState<InvoiceFormState>(defaultInvoiceFormState())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedCustomer = customers.find((c) => c.id === parseInt(state.customerId, 10))

  // Same calculation the backend uses when the invoice is saved (src/shared/calc/invoice-totals.ts).
  const computed = useMemo(() => {
    const lines = state.items.map((item) => {
      const product = products.find((p) => p.id === parseInt(item.productId, 10))
      const parsedQty = parseInt(item.quantity || '0', 10)
      const qty = Number.isFinite(parsedQty) ? parsedQty : 0
      const price = moneyToCents(item.sellingPrice)
      return { product, qty, price }
    })
    const requestedDiscount = moneyToCents(state.discount)
    const totals = calculateInvoiceTotals(
      lines.map((l) => ({ quantity: l.qty, unitPrice: l.price, unitCost: l.product?.baseCostPrice ?? 0 })),
      requestedDiscount
    )
    return {
      ...totals,
      requestedDiscount,
      lines: lines.map((l, i) => ({ ...l, ...totals.lines[i] })),
    }
  }, [state.items, state.discount, products])

  const hasStockWarning = computed.lines.some(
    (l) => l.product != null && l.qty > l.product.currentStock
  )

  const setCustomer = (id: string) => {
    setState((s) => ({ ...s, customerId: id }))
    onCustomerChange?.(customers.find((c) => c.id === parseInt(id, 10)))
  }

  const addItem = () => {
    setState((s) => ({ ...s, items: [...s.items, { productId: '', quantity: '1', sellingPrice: '' }] }))
  }

  const updateItem = (index: number, patch: Partial<InvoiceItemInput>) => {
    setState((s) => ({
      ...s,
      items: s.items.map((item, i) => {
        if (i !== index) return item
        const next = { ...item, ...patch }
        if (patch.productId) {
          const product = products.find((p) => p.id === parseInt(patch.productId!, 10))
          next.sellingPrice = product ? String(product.sellingPrice / 100) : item.sellingPrice
        }
        return next
      }),
    }))
  }

  const removeItem = (index: number) => {
    setState((s) => ({ ...s, items: s.items.filter((_, i) => i !== index) }))
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!state.customerId) next.customerId = 'Choose a customer'
    if (!state.date) next.date = 'Date is required'
    if (state.items.length === 0) next.items = 'Add at least one item'
    state.items.forEach((item, i) => {
      const key = `item-${i}`
      if (!item.productId) {
        next[key] = 'Choose a product'
        return
      }
      const qty = parseInt(item.quantity || '0', 10)
      if (!Number.isInteger(qty) || qty <= 0) {
        next[key] = 'Quantity must be a positive whole number'
        return
      }
      const product = products.find((p) => p.id === parseInt(item.productId, 10))
      if (qty > (product?.currentStock ?? 0)) {
        next[key] = `Only ${product?.currentStock ?? 0} in stock`
        return
      }
      const priceText = item.sellingPrice.trim()
      const parsedPrice = Number(priceText)
      if (!priceText || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
        next[key] = 'Enter a price'
        return
      }
      if (product && moneyToCents(priceText) < product.minSellingPrice) {
        next[key] = `Below min price (${formatMoney(product.minSellingPrice)})`
      }
    })
    if (computed.requestedDiscount > computed.subtotal) {
      next.discount = 'Discount cannot be more than the subtotal'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    const payload: CreateInvoiceDTO = {
      customerId: parseInt(state.customerId, 10),
      date: state.date,
      dueDate: state.dueDate || undefined,
      discount: moneyToCents(state.discount),
      notes: state.notes.trim() || undefined,
      items: state.items.map((item) => {
        const product = products.find((p) => p.id === parseInt(item.productId, 10))
        const qty = parseInt(item.quantity, 10)
        const price = moneyToCents(item.sellingPrice)
        return {
          productId: parseInt(item.productId, 10),
          productName: product?.name ?? '',
          productSku: product?.sku ?? '',
          unit: product?.unit,
          quantity: qty,
          costPriceAtSale: product?.baseCostPrice ?? 0,
          minSellingPriceAtSale: product?.minSellingPrice ?? 0,
          actualSellingPrice: price,
        }
      }),
    }

    setSaving(true)
    try {
      const err = await onSubmit(payload)
      if (err) setServerError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field field-span-2">
          <span>Customer *</span>
          <select value={state.customerId} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {formatMoney(c.balance)}
              </option>
            ))}
          </select>
          {errors.customerId && <em className="field-error">{errors.customerId}</em>}
          {selectedCustomer && (
            <span className="fine-text muted">
              {selectedCustomer.balance < 0
                ? `Credit on account: ${formatMoney(-selectedCustomer.balance)} (applied to this invoice automatically)`
                : `Outstanding: ${formatMoney(selectedCustomer.outstanding)}`}
            </span>
          )}
        </label>

        <label className="field">
          <span>Date *</span>
          <input
            type="date"
            value={state.date}
            onChange={(e) => setState((s) => ({ ...s, date: e.target.value }))}
          />
          {errors.date && <em className="field-error">{errors.date}</em>}
        </label>

        <label className="field">
          <span>Due date</span>
          <input
            type="date"
            value={state.dueDate}
            onChange={(e) => setState((s) => ({ ...s, dueDate: e.target.value }))}
          />
        </label>

        <label className="field">
          <span>Discount</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={state.discount}
            onChange={(e) => setState((s) => ({ ...s, discount: e.target.value }))}
          />
          {errors.discount && <em className="field-error">{errors.discount}</em>}
        </label>

        <label className="field field-span-2">
          <span>Notes</span>
          <textarea
            value={state.notes}
            onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
            rows={2}
          />
        </label>
      </div>

      <div className="field">
        <span>Items *</span>
        {errors.items && <em className="field-error">{errors.items}</em>}
        {hasStockWarning && <em className="field-error">One or more items exceed available stock.</em>}
      </div>

      <div className="item-lines">
        {state.items.map((item, i) => {
          const line = computed.lines[i]
          return (
            <div key={i} className="item-line">
              <select
                value={item.productId}
                onChange={(e) => updateItem(i, { productId: e.target.value })}
              >
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — {p.currentStock} in stock
                  </option>
                ))}
              </select>
              <input
                className="qty-input"
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => updateItem(i, { quantity: e.target.value })}
                aria-label="Quantity"
              />
              <input
                className="line-input money"
                type="number"
                step="0.01"
                min={0}
                value={item.sellingPrice}
                onChange={(e) => updateItem(i, { sellingPrice: e.target.value })}
                aria-label="Selling price"
                placeholder="Price"
              />
              {line?.product && (
                <span className="fine-text muted line-hint">
                  Min {formatMoney(line.product.minSellingPrice)} · Cost {formatMoney(line.product.baseCostPrice)}
                </span>
              )}
              <span className="line-total">{formatMoney(line?.lineSubtotal ?? 0)}</span>
              <button type="button" className="btn ghost icon" onClick={() => removeItem(i)} title="Remove item">
                ✕
              </button>
              {errors[`item-${i}`] && <em className="field-error">{errors[`item-${i}`]}</em>}
            </div>
          )
        })}
      </div>

      {products.length > 0 && (
        <button type="button" className="btn small ghost" onClick={addItem}>
          + Add item
        </button>
      )}

      <div className="totals-grid">
        <div className="totals-row">
          <span>Subtotal</span>
          <span>{formatMoney(computed.subtotal)}</span>
        </div>
        <div className="totals-row">
          <span>Discount</span>
          <span>−{formatMoney(computed.discount)}</span>
        </div>
        <div className="totals-row strong">
          <span>Total</span>
          <span>{formatMoney(computed.total)}</span>
        </div>
        <div className="totals-row">
          <span>Estimated profit</span>
          <span>{formatMoney(computed.profit)}</span>
        </div>
      </div>

      {serverError && <div className="form-error">{serverError}</div>}

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save invoice'}
        </button>
      </div>
    </form>
  )
}
