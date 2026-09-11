import { useState } from 'react'
import type { Customer, CustomerWithBalance, CreateCustomerDTO } from '@shared/types/customer'
import { useCustomers } from '../hooks/useCustomers'
import { CustomerForm } from './CustomerForm'
import { formatMoney } from '../../../lib/format'

interface CustomerListProps {
  onSelect: (customer: CustomerWithBalance) => void
}

export function CustomerList({ onSelect }: CustomerListProps) {
  const {
    visible,
    loading,
    error,
    outstandingCount,
    query,
    setQuery,
    createCustomer,
    updateCustomer,
  } = useCustomers()

  const [form, setForm] = useState<{ mode: 'create' | 'edit'; customer: Customer | null } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleFormSubmit = async (payload: CreateCustomerDTO): Promise<string | null> => {
    if (!form) return null
    const err =
      form.mode === 'create'
        ? await createCustomer(payload)
        : await updateCustomer(form.customer!.id, payload)
    if (!err) setForm(null)
    return err
  }

  return (
    <div className="feature">
      <div className="feature-header">
        <p className="muted page-intro">Manage customers and track account balances from their ledger.</p>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search by name or address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="spacer" />
        <span className="muted fine-text">{outstandingCount} with outstanding balance</span>
        <button className="btn primary" onClick={() => setForm({ mode: 'create', customer: null })}>
          + Add customer
        </button>
      </div>

      {actionError && <div className="form-error">{actionError}</div>}

      {loading ? (
        <div className="empty-state">
          <p className="muted">Loading customers…</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="form-error">{error}</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th className="num">Balance</th>
                <th className="num">Outstanding</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No customers found.
                  </td>
                </tr>
              )}
              {visible.map((c) => (
                <tr key={c.id} onClick={() => onSelect(c)}>
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>{c.address ?? '—'}</td>
                  <td
                    className={`num ${
                      c.balance > 0 ? 'text-warn' : c.balance < 0 ? 'text-ok' : ''
                    }`}
                  >
                    {formatMoney(c.balance)}
                  </td>
                  <td className={`num ${c.outstanding > 0 ? 'text-danger' : ''}`}>
                    {c.outstanding > 0 ? formatMoney(c.outstanding) : '—'}
                  </td>
                  <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                    <button className="btn small" onClick={() => onSelect(c)}>
                      View
                    </button>
                    <button className="btn small ghost" onClick={() => setForm({ mode: 'edit', customer: c })}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal title={form.mode === 'create' ? 'Add customer' : 'Edit customer'} onClose={() => setForm(null)}>
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