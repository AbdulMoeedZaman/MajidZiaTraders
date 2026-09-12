import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import type { Customer, CustomerWithBalance } from '@shared/types/customer'
import { formatDate, formatMoney } from '../../../lib/format'
import { useCustomerLedger } from '../hooks/useCustomerLedger'
import { CustomerLedgerTable } from './CustomerLedgerTable'
import { CustomerForm } from './CustomerForm'
import { DateRangePicker } from '../../../components/DateRangePicker'
import type { CustomerFormMode } from '../types/customer-form'

interface CustomerDetailPageProps {
  customerId: number
  onBack: () => void
}

const deleteArmed = new WeakSet<CustomerWithBalance>()

function confirmDelete(customer: CustomerWithBalance): boolean {
  if (deleteArmed.has(customer)) {
    deleteArmed.delete(customer)
    return true
  }
  deleteArmed.add(customer)
  window.setTimeout(() => deleteArmed.delete(customer), 3000)
  return false
}

export function CustomerDetailPage({ customerId, onBack }: CustomerDetailPageProps) {
  const ledger = useCustomerLedger(customerId)
  const [customer, setCustomer] = useState<CustomerWithBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<{ mode: CustomerFormMode; customer: Customer | null } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCustomer(await api.customers.getWithBalance(customerId))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="feature">
        <div className="muted">Loading customer…</div>
      </div>
    )
  }

  if (error || !customer) {
    return (
      <div className="feature">
        <div className="form-error">{error ?? 'Customer not found'}</div>
      </div>
    )
  }

  const handleFormSubmit = async (payload: Parameters<typeof api.customers.update>[1]): Promise<string | null> => {
    if (!form) return null
    try {
      await api.customers.update(customerId, payload)
      await load()
      setForm(null)
      return null
    } catch (e) {
      return String(e)
    }
  }

  const handleDelete = () => {
    setActionError(null)
    api.customers
      .delete(customerId)
      .then(() => onBack())
      .catch((e) => setActionError(String(e)))
  }

  const summary = ledger.summary

  return (
    <div className="feature">
      {actionError && <div className="form-error">{actionError}</div>}

      <div className="detail customer-detail">
        <div className="detail-header">
          <div>
            <h3>{customer.name}</h3>
            <span className="muted">
              customer · since{' '}
              {formatDate(customer.createdAt)}
            </span>
          </div>
        </div>

        {customer.address && (
          <dl className="detail-rows">
            <div>
              <dt>Address</dt>
              <dd>{customer.address}</dd>
            </div>
          </dl>
        )}

        <div className="balance-cards">
          <div className="balance-card">
            <span className="muted">Balance</span>
            <strong
              className={customer.balance > 0 ? 'text-warn' : customer.balance < 0 ? 'text-ok' : ''}
            >
              {formatMoney(customer.balance)}
            </strong>
            <span className="muted fine-text">
              {customer.balance > 0
                ? 'owes us'
                : customer.balance < 0
                  ? 'credit on account'
                  : 'settled'}
            </span>
          </div>
          <div className="balance-card">
            <span className="muted">Outstanding</span>
            <strong className={customer.outstanding > 0 ? 'text-danger' : ''}>
              {formatMoney(customer.outstanding)}
            </strong>
            <span className="muted fine-text">
              {summary ? `${summary.entryCount} ledger entries` : '…'}
            </span>
          </div>
          <div className="balance-card">
            <span className="muted">Total billed</span>
            <strong>{formatMoney(summary?.totalDebit ?? customer.totalDebit)}</strong>
            <span className="muted fine-text">total debit</span>
          </div>
          <div className="balance-card">
            <span className="muted">Total paid</span>
            <strong>{formatMoney(summary?.totalCredit ?? customer.totalCredit)}</strong>
            <span className="muted fine-text">total credit</span>
          </div>
        </div>

        <div className="detail-actions">
          <button className="btn" onClick={() => setForm({ mode: 'edit', customer })}>
            Edit
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirmDelete(customer)) handleDelete()
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="ledger-block">
        <div className="ledger-toolbar">
          <h3 className="ledger-title">Ledger / Transaction history</h3>
          <div className="ledger-dates">
            <DateRangePicker
              from={ledger.from}
              to={ledger.to}
              onChange={(r) => {
                ledger.setFrom(r.from)
                ledger.setTo(r.to)
              }}
              placeholder="All dates"
            />
          </div>
        </div>
        <CustomerLedgerTable entries={ledger.entries} loading={ledger.loading} error={ledger.error} />
      </div>

      {form && (
        <Modal title="Edit customer" onClose={() => setForm(null)}>
          <CustomerForm
            mode={form.mode}
            customer={form.customer}
            onSubmit={handleFormSubmit}
            onCancel={() => setForm(null)}
          />
        </Modal>
      )}
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
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