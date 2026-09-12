import { useEffect, useState } from 'react'
import type { Route } from '@shared/types/route'
import type { Customer } from '@shared/types/customer'

export interface CustomerFormData {
  code: string
  shopName: string
  ownerName: string
  phone: string
  address: string
  routeId: number
}

interface Props {
  routes: Route[]
  initialRouteId: number
  initial?: Customer | null
  onSave: (data: CustomerFormData) => Promise<void>
  onCancel: () => void
}

export function CustomerForm({ routes, initialRouteId, initial, onSave, onCancel }: Props) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [shopName, setShopName] = useState(initial?.shopName ?? '')
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [routeId, setRouteId] = useState(initial?.routeId ?? initialRouteId)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const submit = async () => {
    setError(null)
    if (!code.trim()) {
      setError('Customer code is required')
      return
    }
    if (!(shopName.trim() || ownerName.trim())) {
      setError('Provide a shop name or an owner name')
      return
    }
    if (!routes.some((r) => r.id === routeId)) {
      setError('Select a delivery route')
      return
    }
    setSaving(true)
    try {
      await onSave({
        code: code.trim(),
        shopName: shopName.trim(),
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        routeId,
      })
      onCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save customer')
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{initial ? 'Edit Customer' : 'Add Customer'}</h3>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <label className="field">
            <span>Customer code</span>
            <input
              type="text"
              value={code}
              autoFocus
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. MK-001"
            />
          </label>
          <label className="field">
            <span>Route</span>
            <select value={routeId} onChange={(e) => setRouteId(Number(e.target.value))}>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Shop name</span>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Shop / business name"
            />
          </label>
          <label className="field">
            <span>Owner name</span>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Customer / owner name"
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
            />
          </label>
          <label className="field field-span-2">
            <span>Address</span>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address"
              rows={2}
            />
          </label>
        </div>
        <div className="form-actions">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}