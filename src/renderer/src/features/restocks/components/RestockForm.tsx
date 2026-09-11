import { useMemo, useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { CreateRestockDTO } from '@shared/types/restock'
import {
  RestockFormState,
  RestockItemInput,
  defaultRestockFormState,
  defaultRestockItemInput,
} from '../types/restock-form'
import { computeRestockLineTotals, aggregateRestockLines } from '@shared/calc/restock-totals'

function parseDollars(raw: string): number {
  const v = parseFloat(raw)
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : 0
}

function parseBps(raw: string): number {
  const v = parseInt(raw, 10)
  return Number.isFinite(v) && v >= 0 ? v : 0
}

function parseCount(raw: string): number {
  const v = parseInt(raw, 10)
  return Number.isFinite(v) && v >= 0 ? v : 0
}

function toDollars(paisa: number): string {
  return (paisa / 100).toFixed(2)
}

interface RestockFormProps {
  products: ProductWithStock[]
  initial?: Partial<RestockFormState>
  onSubmit: (payload: CreateRestockDTO) => Promise<string | null>
  onCancel: () => void
}

export function RestockForm({ products, initial, onSubmit, onCancel }: RestockFormProps) {
  const [state, setState] = useState<RestockFormState>(() => ({
    ...defaultRestockFormState(),
    ...initial,
    items: initial?.items?.length ? initial.items : [],
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const liveTotals = useMemo(() => {
    const lines = state.items.map((item) => {
      const product = products.find((p) => p.id === parseInt(item.productId, 10))
      return {
qtyCartons: parseCount(item.qtyCartons) || 1,
            piecesPerCarton: parseCount(item.piecesPerCarton) || product?.piecesPerCarton || 1,
            mrpPerPiece: item.mrpPerPiece ? parseDollars(item.mrpPerPiece) : product?.mrp ?? null,
        salesTaxRate: item.salesTaxRate ? parseDollars(item.salesTaxRate) : 1800,
        advanceTaxRate: item.advanceTaxRate ? parseDollars(item.advanceTaxRate) : 10,
        netSalesValueExcl: parseDollars(item.netSalesValueExcl),
        tradeDiscountValue: parseDollars(item.tradeDiscountValue),
      }
    })
    const lineTotals = aggregateRestockLines(lines.map((l) => {
      const t = computeRestockLineTotals(l)
      return {
        qtyCartons: l.qtyCartons,
        piecesPerCarton: l.piecesPerCarton,
        totalRetailValueExcl: t.totalRetailValueExcl,
        salesTaxAmount: t.salesTaxAmount,
        advanceTax: t.advanceTax,
        tradeDiscountValue: l.tradeDiscountValue,
        netSalesValueExcl: l.netSalesValueExcl,
        discountedValueInclusive: t.discountedValueInclusive,
      }
    }))
    return lineTotals
  }, [state.items, products])

  const addItem = () => {
    setState((s) => ({
      ...s,
      items: [...s.items, defaultRestockItemInput()],
    }))
  }

  const updateItem = (index: number, patch: Partial<RestockItemInput>) => {
    setState((s) => ({
      ...s,
      items: s.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }))
  }

  const removeItem = (index: number) => {
    setState((s) => ({ ...s, items: s.items.filter((_, i) => i !== index) }))
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!state.supplierName.trim()) next.supplierName = 'Supplier name is required'
    if (state.items.length === 0) next.items = 'Add at least one item'
    state.items.forEach((item, i) => {
      if (!item.productId) next[`item-${i}`] = 'Choose a product'
      const qty = parseInt(item.qtyCartons || '0', 10)
      if (!Number.isInteger(qty) || qty <= 0) next[`item-${i}`] = 'Qty cartons must be a positive whole number'
      const pieces = parseInt(item.piecesPerCarton || '0', 10)
      if (!Number.isInteger(pieces) || pieces < 1) next[`item-${i}`] = 'Pieces per carton must be at least 1'
      if (!item.netSalesValueExcl || parseFloat(item.netSalesValueExcl) < 0) next[`item-${i}`] = 'Net sales value (excl.) is required'
    })
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    const payload: CreateRestockDTO = {
      supplierName: state.supplierName.trim(),
      date: state.date,
      notes: state.notes.trim() || null,
      supplierInvoiceNo: state.supplierInvoiceNo.trim() || null,
      supplierRegistrationNo: state.supplierRegistrationNo.trim() || null,
      buyerNtn: state.buyerNtn.trim() || null,
      buyerCnic: state.buyerCnic.trim() || null,
      dispatchNoteNo: state.dispatchNoteNo.trim() || null,
      salesOrderNo: state.salesOrderNo.trim() || null,
      items: state.items.map((item) => ({
        productId: parseInt(item.productId, 10),
        qtyCartons: parseInt(item.qtyCartons, 10),
        piecesPerCarton: parseInt(item.piecesPerCarton, 10),
        mrpPerPiece: item.mrpPerPiece ? parseDollars(item.mrpPerPiece) : null,
        netSalesValueExcl: parseDollars(item.netSalesValueExcl),
        tradeDiscountValue: parseDollars(item.tradeDiscountValue) || 0,
        salesTaxRate: item.salesTaxRate ? parseBps(item.salesTaxRate) : 1800,
        advanceTaxRate: item.advanceTaxRate ? parseBps(item.advanceTaxRate) : 10,
      })),
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
        <label className="field">
          <span>Supplier name *</span>
          <input
            value={state.supplierName}
            onChange={(e) => setState((s) => ({ ...s, supplierName: e.target.value }))}
            placeholder="e.g. Acme Distributors"
          />
          {errors.supplierName && <em className="field-error">{errors.supplierName}</em>}
        </label>

        <label className="field">
          <span>Date *</span>
          <input
            type="date"
            value={state.date}
            onChange={(e) => setState((s) => ({ ...s, date: e.target.value }))}
          />
        </label>

        <label className="field">
          <span>Supplier invoice no.</span>
          <input value={state.supplierInvoiceNo} onChange={(e) => setState((s) => ({ ...s, supplierInvoiceNo: e.target.value }))} />
        </label>
        <label className="field">
          <span>Supplier registration no.</span>
          <input value={state.supplierRegistrationNo} onChange={(e) => setState((s) => ({ ...s, supplierRegistrationNo: e.target.value }))} />
        </label>
        <label className="field">
          <span>Buyer NTN</span>
          <input value={state.buyerNtn} onChange={(e) => setState((s) => ({ ...s, buyerNtn: e.target.value }))} />
        </label>
        <label className="field">
          <span>Buyer CNIC</span>
          <input value={state.buyerCnic} onChange={(e) => setState((s) => ({ ...s, buyerCnic: e.target.value }))} />
        </label>
        <label className="field">
          <span>Dispatch note no.</span>
          <input value={state.dispatchNoteNo} onChange={(e) => setState((s) => ({ ...s, dispatchNoteNo: e.target.value }))} />
        </label>
        <label className="field">
          <span>Sales order no.</span>
          <input value={state.salesOrderNo} onChange={(e) => setState((s) => ({ ...s, salesOrderNo: e.target.value }))} />
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
      </div>

      <div className="item-lines">
        {state.items.map((item, i) => {
          const product = products.find((p) => p.id === parseInt(item.productId, 10))
          const line = computeRestockLineTotals({
qtyCartons: parseCount(item.qtyCartons) || 1,
        piecesPerCarton: parseCount(item.piecesPerCarton) || product?.piecesPerCarton || 1,
        mrpPerPiece: item.mrpPerPiece ? parseDollars(item.mrpPerPiece) : product?.mrp ?? null,
        salesTaxRate: item.salesTaxRate ? parseBps(item.salesTaxRate) : 1800,
        advanceTaxRate: item.advanceTaxRate ? parseBps(item.advanceTaxRate) : 10,
            netSalesValueExcl: parseDollars(item.netSalesValueExcl),
            tradeDiscountValue: parseDollars(item.tradeDiscountValue),
          })

          return (
            <div key={i} className="item-line restock-line">
              <select
                value={item.productId}
                onChange={(e) => {
                  const p = products.find((pp) => pp.id === parseInt(e.target.value, 10))
                  updateItem(i, {
                    productId: e.target.value,
                    piecesPerCarton: p ? String(p.piecesPerCarton) : item.piecesPerCarton,
                    mrpPerPiece: p?.mrp != null ? toDollars(p.mrp) : item.mrpPerPiece,
                  })
                }}
              >
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — {p.currentStock} in stock
                  </option>
                ))}
              </select>
              <input className="qty-input" type="number" min={1} value={item.qtyCartons} onChange={(e) => updateItem(i, { qtyCartons: e.target.value })} aria-label="Qty cartons" placeholder="Cartons" />
              <input className="qty-input" type="number" min={1} value={item.piecesPerCarton} onChange={(e) => updateItem(i, { piecesPerCarton: e.target.value })} aria-label="Pieces / carton" placeholder="Pcs/ctn" />
              <input className="line-input money" type="number" step="0.01" min={0} value={item.mrpPerPiece} onChange={(e) => updateItem(i, { mrpPerPiece: e.target.value })} aria-label="MRP per piece" placeholder="MRP" />
              <input className="line-input money" type="number" step="0.01" min={0} value={item.netSalesValueExcl} onChange={(e) => updateItem(i, { netSalesValueExcl: e.target.value })} aria-label="Net value (excl.)" placeholder="Net excl." />
              <input className="line-input money" type="number" step="0.01" min={0} value={item.tradeDiscountValue} onChange={(e) => updateItem(i, { tradeDiscountValue: e.target.value })} aria-label="Trade discount" placeholder="Disc." />
              <input className="qty-input" type="number" min={0} value={item.salesTaxRate} onChange={(e) => updateItem(i, { salesTaxRate: e.target.value })} aria-label="Sales tax rate (bps)" placeholder="Tax bps" title="Sales tax rate in basis points (1800 = 18%); blank = business default" />
              <input className="qty-input" type="number" min={0} value={item.advanceTaxRate} onChange={(e) => updateItem(i, { advanceTaxRate: e.target.value })} aria-label="Advance tax rate (bps)" placeholder="Adv bps" title="Advance tax rate in basis points (10 = 0.1%); blank = business default" />
              <span className="line-total">${toDollars(line.discountedValueInclusive)}</span>
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

      <div className="totals-row">
        <strong>Total cost (payable)</strong>
        <strong>${toDollars(liveTotals.totalCost)}</strong>
      </div>

      {serverError && <div className="form-error">{serverError}</div>}

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save restock'}
        </button>
      </div>
    </form>
  )
}