import { useCallback, useEffect, useState } from 'react'
import type { ProductWithStock } from '@shared/types/inventory'
import type { CustomerWithBalance } from '@shared/types/customer'
import type { InvoiceWithCustomer, CreateInvoiceDTO } from '@shared/types/invoice'
import { api } from '../../../lib/api'
import { useInvoices } from '../hooks/useInvoices'
import { createCsvExport } from '../../../lib/csv'
import { InvoiceForm } from './InvoiceForm'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_FILTERS } from '../types/invoice-form'
import { formatDate, formatMoney } from '../../../lib/format'
import type { ReactNode } from 'react'

interface InvoiceListProps {
  onSelect: (invoice: InvoiceWithCustomer) => void
}

export function InvoiceList({ onSelect }: InvoiceListProps) {
  const { visible, loading, error, filter, setFilter, query, setQuery, createInvoice } = useInvoices()

  const [customers, setCustomers] = useState<CustomerWithBalance[]>([])
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [defaultTaxRate, setDefaultTaxRate] = useState<number>(0)
  const [formOpen, setFormOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Customers, stock levels and the default tax rate are reloaded every time the form opens,
  // so a new invoice never works from stale stock numbers.
  const loadFormData = useCallback(async () => {
    const [c, p, profile] = await Promise.all([
      api.customers.listWithBalance('active').catch(() => [] as CustomerWithBalance[]),
      api.products.listActiveWithStock().catch(() => [] as ProductWithStock[]),
      api.businessProfile.get().catch(() => null),
    ])
    setCustomers(c)
    setProducts(p)
    setDefaultTaxRate(profile?.taxRate ?? 0)
  }, [])

  const openForm = useCallback(async () => {
    await loadFormData()
    setFormOpen(true)
  }, [loadFormData])

  useEffect(() => {
    void loadFormData()
  }, [loadFormData])

  const handleFormSubmit = useCallback(
    async (payload: CreateInvoiceDTO): Promise<string | null> => {
      const err = await createInvoice(payload)
      if (err === null) {
        setFormOpen(false)
        void loadFormData()
      }
      return err
    },
    [createInvoice, loadFormData]
  )

  const handleExport = async (status: string) => {
    const result = await api.dialogs.saveFile({ defaultPath: 'invoices.csv' })
    if (result.canceled || !result.filePath) return
    try {
      const filters: Record<string, unknown> = {}
      if (status !== 'all') filters.status = status
      await createCsvExport({
        entityType: 'invoices',
        filePath: result.filePath,
        columns: [
          'invoiceNumber', 'customerName', 'date', 'dueDate', 'subtotal', 'taxAmount',
          'total', 'totalCost', 'totalProfit', 'discount', 'paid', 'outstanding', 'status',
        ],
        filters,
      })
      setActionError(null)
    } catch (e) {
      setActionError(String(e))
    }
  }

  return (
    <div className="feature">
      <div className="toolbar">
        <input className="search-input" placeholder="Search invoice # or customer…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="segmented">
          {INVOICE_STATUS_FILTERS.map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => void handleExport(filter)} disabled={visible.length === 0}>
          Export CSV
        </button>
        <button className="btn primary" onClick={() => void openForm()}>
          + New invoice
        </button>
      </div>

      {actionError && <div className="form-error">{actionError}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : error ? (
        <div className="form-error">{error}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Due</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="num">Outstanding</th>
                <th>Status</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    No invoices found.
                  </td>
                </tr>
              )}
              {visible.map((inv) => (
                <tr key={inv.id} onClick={() => onSelect(inv)}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{inv.customerName}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td>{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                  <td className="num">{formatMoney(inv.total)}</td>
                  <td className="num">{formatMoney(inv.paid)}</td>
                  <td className="num">{formatMoney(inv.outstanding)}</td>
                  <td>
                    <span className={`badge ${statusBadgeTone(inv.status)}`}>
                      {INVOICE_STATUS_LABELS[inv.status]}
                    </span>
                  </td>
                  <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                    <button className="btn small" onClick={() => onSelect(inv)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <Modal title="New invoice" onClose={() => setFormOpen(false)}>
          <InvoiceForm
            customers={customers}
            products={products}
            defaultTaxRate={defaultTaxRate}
            onSubmit={handleFormSubmit}
            onCancel={() => setFormOpen(false)}
          />
        </Modal>
      )}
    </div>
  )
}

export function statusBadgeTone(status: string): string {
  switch (status) {
    case 'paid':
      return 'ok'
    case 'sent':
      return ''
    case 'partial':
      return 'warn'
    case 'overdue':
      return 'danger'
    case 'cancelled':
      return 'danger'
    default:
      return ''
  }
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
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