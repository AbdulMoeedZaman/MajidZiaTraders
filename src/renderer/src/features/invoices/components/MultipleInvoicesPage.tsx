import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../lib/api'
import { moneyToCents } from '../../../lib/money'
import { formatDate, formatMoney } from '../../../lib/format'
import { localDate } from '@shared/date'
import { MultiInvoiceForm, type MultiInvoiceFormHandle, type MultiInvoiceFormValues } from './MultiInvoiceForm'
import { LoadFormReport } from './LoadFormReport'
import { StatusBadge } from '../../../components/StatusBadge'
import type { Product } from '@shared/types/product'
import type { Customer } from '@shared/types/customer'
import type { CreateInvoiceDTO, Invoice, LoadFormSummary } from '@shared/types/invoice'

interface Props {
  /** Selected customers in the order they were picked. */
  customerIds: number[]
  /** The single booker applied to every invoice in the sequence. */
  brokerId: number
  onClose: () => void
}

type Stage = 'entry' | 'summary'

export function MultipleInvoicesPage({ customerIds, brokerId, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [stockLevels, setStockLevels] = useState<Record<number, number>>({})
  const [index, setIndex] = useState(0)
  const [completed, setCompleted] = useState<Map<number, Invoice>>(new Map())
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [stage, setStage] = useState<Stage>('entry')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<LoadFormSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const formRef = useRef<MultiInvoiceFormHandle | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [c, p, levels] = await Promise.all([
          api.customers.list(),
          api.products.list(),
          api.stock.levels(),
        ])
        if (cancelled) return
        setCustomers(c)
        setProducts(p)
        const map: Record<number, number> = {}
        for (const lv of levels) map[lv.productId] = lv.quantity
        setStockLevels(map)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load invoice data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the selected customers in the order they were picked, skipping any id
  // that no longer exists.
  const queue = useMemo(() => {
    const byId = new Map(customers.map((c) => [c.id, c]))
    return customerIds.map((id) => byId.get(id)).filter((c): c is Customer => !!c)
  }, [customers, customerIds])

  // Invoice ids (not customer ids) of the created invoices, in queue order, for
  // the load form builder.
  const createdInvoiceIds = useMemo(
    () =>
      queue
        .map((c) => completed.get(c.id)?.id)
        .filter((id): id is number => id !== undefined),
    [queue, completed]
  )

  const current = queue[index]
  const currentDone = !!current && completed.has(current.id)
  const currentSkipped = !!current && skipped.has(current.id)

  const handleSubmit = async (values: MultiInvoiceFormValues) => {
    if (!current) throw new Error('No current customer')
    const dto: CreateInvoiceDTO = {
      customerId: current.id,
      brokerId,
      date: localDate(new Date()),
      filerStatus: values.filerStatus,
      tax: values.tax.trim() === '' ? null : moneyToCents(values.tax),
      items: values.items.map((l) => ({
        productId: l.productId as number,
        rate: moneyToCents(l.rate),
        cartonCount: Number(l.cartons) || 0,
        boxCount: Number(l.pieces) || 0,
      })),
    }
    const created = await api.invoices.create(dto)
    setCompleted((prev) => new Map(prev).set(current.id, created))
    setSkipped((prev) => {
      if (!prev.has(current.id)) return prev
      const next = new Set(prev)
      next.delete(current.id)
      return next
    })
  }

  // Next = save the current invoice (with validation) then move forward. On a
  // completed / skipped card it simply advances; on a pending form it saves
  // first and only advances when the save succeeded.
  const next = async () => {
    if (busy) return
    if (currentDone || currentSkipped) {
      if (index < queue.length - 1) setIndex((i) => i + 1)
      return
    }
    if (!current) return
    setBusy(true)
    try {
      const ok = await formRef.current?.submit()
      if (ok && index < queue.length - 1) setIndex((i) => i + 1)
    } finally {
      setBusy(false)
    }
  }

  const prev = () => {
    if (busy) return
    if (index > 0) setIndex((i) => i - 1)
  }

  const skip = () => {
    if (busy || !current || currentDone) return
    setSkipped((prev) => new Set(prev).add(current.id))
    if (index < queue.length - 1) setIndex((i) => i + 1)
  }

  const revisit = (customerId: number) => {
    setSkipped((prev) => {
      const next = new Set(prev)
      next.delete(customerId)
      return next
    })
  }

  const finish = () => {
    if (busy || completed.size === 0) return
    setStage('summary')
  }

  // Keyboard shortcuts: → next (saves first), ← previous, Esc finish, Tab skip.
  // Combobox keystrokes (SearchSelect) keep their own behaviour.
  useEffect(() => {
    if (stage !== 'entry') return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // Combobox keystrokes (SearchSelect) keep their own behaviour — the menu
      // is portaled, so match both the trigger wrapper and the menu itself.
      const inSelect = !!target?.closest?.('.search-select, .search-select-menu')
      if (inSelect) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        void next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        finish()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, index, queue, currentDone, currentSkipped, busy, completed.size]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build the combined load form once the user reaches the summary screen.
  useEffect(() => {
    if (stage !== 'summary') return
    let cancelled = false
    setSummaryError(null)
    api.invoices
      .buildLoadForm(createdInvoiceIds)
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch((e) => {
        if (!cancelled) setSummaryError(e instanceof Error ? e.message : 'Failed to build load form')
      })
    return () => {
      cancelled = true
    }
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && queue.length === 0) {
    return <div className="placeholder"><h3>Loading invoice data…</h3></div>
  }
  if (error) return <div className="error-screen">{error}</div>
  if (queue.length === 0) {
    return (
      <div className="feature">
        <div className="empty-state">
          <h3>No selected customers</h3>
          <p>The selected customers could not be loaded.</p>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  if (stage === 'summary') {
    return (
      <div className="feature">
        <div className="section-title">Generated Invoices</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice no.</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="num">Subtotal</th>
                <th className="num">Grand total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((customer) => {
                const inv = completed.get(customer.id)
                if (!inv) return null
                return (
                  <tr key={customer.id}>
                    <td className="mono">{inv.invoiceNumber}</td>
                    <td>{formatDate(inv.date)}</td>
                    <td>
                      {customer.shopName || customer.ownerName}
                      <span className="muted fine-text"> · {customer.code}</span>
                    </td>
                    <td className="num mono">{formatMoney(inv.subtotal)}</td>
                    <td className="num mono">{formatMoney(inv.grandTotal ?? inv.subtotal)}</td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {summaryError && <div className="form-error">{summaryError}</div>}
        {!summary && !summaryError && (
          <div className="placeholder">
            <h3>Building load form…</h3>
          </div>
        )}
        {summary && (
          <LoadFormReport summary={summary} invoiceIds={createdInvoiceIds} onClose={onClose} backLabel="Done" />
        )}
      </div>
    )
  }

  const currentInvoice = current ? completed.get(current.id) : undefined
  const prevCustomer = index > 0 ? queue[index - 1] : undefined
  const nextCustomer = index < queue.length - 1 ? queue[index + 1] : undefined
  const shopName = (c: Customer | undefined): string => (c ? c.shopName || c.ownerName : '')

  return (
    <div className="feature">
      <div className="multi-header">
        <div className="multi-nav prev">{shopName(prevCustomer)}</div>
        <div className="multi-title">{shopName(current)}</div>
        <div className="multi-nav next">{shopName(nextCustomer)}</div>
      </div>

      {current && currentInvoice && (
        <div className="form-success multi-message">
          Invoice {currentInvoice.invoiceNumber} created for this customer.
        </div>
      )}

      {current && !currentDone && currentSkipped ? (
        <div className="totals-card multi-skip-card">
          <div className="totals-row">
            <span>Customer</span>
            <strong>
              {current.code} — {current.shopName || current.ownerName}
            </strong>
          </div>
          <div className="totals-row">
            <span>Invoice</span>
            <strong className="muted">Not created</strong>
          </div>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => revisit(current.id)} disabled={busy}>
              Create invoice
            </button>
          </div>
        </div>
      ) : current && !currentDone ? (
        <MultiInvoiceForm
          key={current.id}
          ref={formRef}
          products={products}
          stockLevels={stockLevels}
          onSubmit={handleSubmit}
        />
      ) : current && currentInvoice ? (
        <div className="totals-card">
          <div className="totals-row">
            <span>Customer</span>
            <strong>
              {current.code} — {current.shopName || current.ownerName}
            </strong>
          </div>
          <div className="totals-row">
            <span>Invoice no.</span>
            <strong className="mono">{currentInvoice.invoiceNumber}</strong>
          </div>
          <div className="totals-row">
            <span>Date</span>
            <strong>{formatDate(currentInvoice.date)}</strong>
          </div>
          <div className="totals-row">
            <span>Grand total</span>
            <strong className="mono">{formatMoney(currentInvoice.grandTotal ?? currentInvoice.subtotal)}</strong>
          </div>
          <div className="totals-row">
            <span>Status</span>
            <StatusBadge status={currentInvoice.status} />
          </div>
        </div>
      ) : null}

      <div className="multi-bar">
        <button className="btn ghost" onClick={prev} disabled={index === 0 || busy}>
          ← Previous
        </button>
        <button className="btn ghost" onClick={skip} disabled={busy || !current || currentDone}>
          Skip
        </button>
        <div className="spacer" />
        <button className="btn ghost" onClick={finish} disabled={completed.size === 0 || busy}>
          Finish
        </button>
        <button className="btn primary" onClick={() => void next()} disabled={busy}>
          {busy ? 'Saving…' : 'Next →'}
        </button>
      </div>
    </div>
  )
}