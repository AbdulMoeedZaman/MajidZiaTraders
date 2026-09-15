import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { api } from '../lib/api'
import { getSelectedRoute } from '../lib/selected-route'
import { prepareBulkPrintData } from '../lib/bulk-print'
import { SearchSelect, type SearchSelectHandle } from './SearchSelect'
import { LoadFormBulkPrint, type BulkPrintData } from '../features/invoices/components/LoadFormBulkPrint'
import { localDate } from '@shared/date'
import type { CustomerWithRoute } from '@shared/types/customer'
import type { Broker } from '@shared/types/broker'

type Action =
  | {
      kind: 'invoices'
      routeName: string
      /** Customers on the route still needing an invoice today. */
      pending: CustomerWithRoute[]
      /** Customers skipped because they already have an invoice today. */
      alreadyInvoiced: number
    }
  | {
      kind: 'print'
      routeName: string
      /** Today's invoices on the route, in creation order. */
      invoiceIds: number[]
      customerCount: number
    }

interface Message {
  title: string
  body: string
}

interface Props {
  /** Suppresses the shortcuts while a multi-invoice session is mid-flow. */
  enabled: boolean
  onOpenMultipleInvoices: (customerIds: number[], brokerId: number) => void
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * App-level route shortcuts:
 *
 * - Alt+Q — create invoices for every customer on the currently selected
 *   route (customers already invoiced today are skipped after a check).
 * - Alt+W — print today's load form followed by the route's invoices.
 *
 * Both are bulk actions, so each opens a confirmation modal first. They never
 * fire while the focus is in a text field (the whole flow is keyboard-safe),
 * while any modal is open, or while a print job is being prepared, and long
 * key presses do not repeat them.
 */
export function RouteShortcuts({ enabled, onOpenMultipleInvoices }: Props) {
  const [action, setAction] = useState<Action | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [bookers, setBookers] = useState<Broker[]>([])
  const [bookerValue, setBookerValue] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [bulk, setBulk] = useState<BulkPrintData | null>(null)
  const bookerSelectRef = useRef<SearchSelectHandle | null>(null)
  const bookerOpenedRef = useRef(false)
  const runningRef = useRef(false)

  // The keydown listener is registered once; these refs keep its closures
  // pointing at the latest enabled flag and handlers.
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const openInvoicesRef = useRef(onOpenMultipleInvoices)
  openInvoicesRef.current = onOpenMultipleInvoices

  // Auto-open (and focus) the booker search once the confirmation appears.
  useEffect(() => {
    if (!action || action.kind !== 'invoices') return
    if (bookerOpenedRef.current) return
    bookerOpenedRef.current = true
    const raf = requestAnimationFrame(() => bookerSelectRef.current?.open())
    return () => cancelAnimationFrame(raf)
  }, [action])

  useEffect(() => {
    bookerOpenedRef.current = false
  }, [action?.kind])

  const showMessage = (title: string, body: string) => setMessage({ title, body })

  const runInvoices = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setBusy(true)
    try {
      const routeId = getSelectedRoute()
      if (routeId === null) {
        showMessage('No route selected', 'Open Customers and pick a delivery route first.')
        return
      }
      const routes = await api.routes.list()
      const route = routes.find((r) => r.id === routeId)
      if (!route) {
        showMessage('Route not found', 'The selected route no longer exists. Reopen Customers to pick a route.')
        return
      }
      const onRoute = await api.customers.listByRoute(routeId)
      if (onRoute.length === 0) {
        showMessage('No customers on this route', `“${route.name}” has no customers yet. Add a customer on that route first.`)
        return
      }

      // Duplicate check: skip customers who already have a live (non-cancelled)
      // invoice today so a customer is never billed twice in the same day.
      const today = localDate(new Date())
      const todaysInvoices = await api.invoices.listByDate(today, today)
      const invoicedToday = new Set(
        todaysInvoices.filter((inv) => inv.status !== 'cancelled').map((inv) => inv.customerId)
      )
      const pending = onRoute.filter((c) => !invoicedToday.has(c.id))
      const alreadyInvoiced = onRoute.length - pending.length
      if (pending.length === 0) {
        const extra = alreadyInvoiced > 1 ? 's' : ''
        showMessage(
          'All customers already invoiced today',
          `Every customer on “${route.name}” already has an invoice${extra} for today. Nothing to do.`
        )
        return
      }

      const bkrs = await api.brokers.list()
      setBookers(bkrs)
      setBookerValue(bkrs.length === 1 ? bkrs[0].id : null)
      setAction({ kind: 'invoices', routeName: route.name, pending, alreadyInvoiced })
    } catch (e) {
      showMessage('Could not check the route', e instanceof Error ? e.message : 'An unknown error occurred.')
    } finally {
      setBusy(false)
      runningRef.current = false
    }
  }, [])

  const runPrint = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setBusy(true)
    try {
      const routeId = getSelectedRoute()
      if (routeId === null) {
        showMessage('No route selected', 'Open Customers and pick a delivery route first.')
        return
      }
      const routes = await api.routes.list()
      const route = routes.find((r) => r.id === routeId)
      if (!route) {
        showMessage('Route not found', 'The selected route no longer exists. Reopen Customers to pick a route.')
        return
      }
      const onRoute = await api.customers.listByRoute(routeId)
      const customerIds = new Set(onRoute.map((c) => c.id))
      const today = localDate(new Date())
      const todaysInvoices = await api.invoices.listByDate(today, today)
      const invoiceIds = todaysInvoices
        .filter((inv) => inv.status !== 'cancelled' && customerIds.has(inv.customerId))
        .map((inv) => inv.id)
      if (invoiceIds.length === 0) {
        showMessage(
          'Nothing to print yet',
          `No invoices were created today for “${route.name}”. Create them first with Alt+Q, or select another route.`
        )
        return
      }
      setAction({ kind: 'print', routeName: route.name, invoiceIds, customerCount: customerIds.size })
    } catch (e) {
      showMessage('Could not prepare the print', e instanceof Error ? e.message : 'An unknown error occurred.')
    } finally {
      setBusy(false)
      runningRef.current = false
    }
  }, [])

  const confirmInvoices = async (brokerId: number) => {
    if (!action || action.kind !== 'invoices' || busy) return
    setBusy(true)
    try {
      openInvoicesRef.current(action.pending.map((c) => c.id), brokerId)
      setAction(null)
    } finally {
      setBusy(false)
    }
  }

  const confirmPrint = async () => {
    if (!action || action.kind !== 'print' || busy) return
    setBusy(true)
    try {
      const summary = await api.invoices.buildLoadForm(action.invoiceIds)
      const data = await prepareBulkPrintData(summary, action.invoiceIds, true)
      flushSync(() => setBulk(data))
      try {
        window.print()
      } finally {
        setBulk(null)
      }
      setAction(null)
    } catch (e) {
      showMessage('Print failed', e instanceof Error ? e.message : 'The print dialog could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enabledRef.current) return
      if (e.repeat || !e.altKey) return
      if (isTypingTarget(e.target)) return
      // Never stack another modal over an open one (settings uses a
      // `.modal-page`, everything else uses `.overlay`), and never start a
      // second print while one is being prepared.
      if (document.querySelector('.overlay, .modal-page')) return
      if (document.body.classList.contains('bulk-printing')) return
      if (e.code === 'KeyQ') {
        e.preventDefault()
        void runInvoices()
      } else if (e.code === 'KeyW') {
        e.preventDefault()
        void runPrint()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runInvoices, runPrint])

  const cancel = () => {
    if (busy) return
    setAction(null)
    setMessage(null)
  }

  // Escape closes the confirmation or message dialogs.
  useEffect(() => {
    if (!action && !message) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [action, message]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendingCount = action?.kind === 'invoices' ? action.pending.length : 0
  const bookerCount = bookers.length

  return (
    <>
      {action && action.kind === 'invoices' && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Create invoices for {action.routeName}</h3>
            </div>
            <p className="fine-text muted" style={{ marginTop: 0 }}>
              {pendingCount} customer{pendingCount === 1 ? '' : 's'} on “{action.routeName}”
              {action.alreadyInvoiced > 0 && (
                <span> · {action.alreadyInvoiced} skipped — already invoiced today</span>
              )}
              . Pick a single booker that will be applied to every invoice.
            </p>
            <div className="field">
              <span>Booker</span>
              <SearchSelect
                ref={bookerSelectRef}
                options={bookers.map((b) => ({ value: b.id, label: b.name }))}
                value={bookerValue}
                onChange={(brokerId) => {
                  setBookerValue(brokerId)
                  if (brokerId !== null) {
                    void confirmInvoices(brokerId)
                  }
                }}
                placeholder="Select booker…"
                emptyText={bookerCount === 0 ? 'No bookers set up' : 'No matches'}
              />
            </div>
            <div className="form-actions">
              <button className="btn ghost" onClick={cancel} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={bookerValue === null || busy || bookerCount === 0}
                onClick={() => void confirmInvoices(bookerValue as number)}
              >
                {busy ? 'Starting…' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      )}

      {action && action.kind === 'print' && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Print load form + invoices</h3>
            </div>
            <p className="fine-text muted" style={{ marginTop: 0 }}>
              Print today's load form followed by {action.invoiceIds.length} invoice
              {action.invoiceIds.length === 1 ? '' : 's'} for “{action.routeName}”
              ({action.customerCount} customer{action.customerCount === 1 ? '' : 's'}).
              Two invoices per landscape page, the first sharing page one with the load form.
            </p>
            <div className="form-actions">
              <button className="btn ghost" onClick={cancel} disabled={busy}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => void confirmPrint()} disabled={busy}>
                {busy ? 'Preparing…' : 'Print'}
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{message.title}</h3>
            </div>
            <p className="fine-text muted" style={{ marginTop: 0 }}>
              {message.body}
            </p>
            <div className="form-actions">
              <button className="btn primary" onClick={() => setMessage(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {bulk && <LoadFormBulkPrint data={bulk} />}
    </>
  )
}