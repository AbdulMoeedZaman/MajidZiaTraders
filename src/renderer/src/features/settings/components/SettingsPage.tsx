import { useCallback, useEffect, useState } from 'react'
import type { BusinessProfile } from '@shared/types/business-profile'
import type { BackupMetadata } from '@shared/types/backup'
import { api } from '../../../lib/api'
import { formatDateTime, localDate } from '../../../lib/format'
import { setCurrency } from '../../../lib/format'
import { PURCHASE_SALES_TAX_SETTING, PURCHASE_ADVANCE_TAX_SETTING } from '@shared/calc/restock-totals'

const EMPTY_PROFILE: BusinessProfile = {
  id: 0,
  name: '',
  ownerName: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  country: null,
  taxId: null,
  taxRate: 0,
  logoPath: null,
  currency: 'USD',
  invoiceFooter: null,
  invoicePrefix: 'INV-',
  invoiceNextNumber: 1,
  createdAt: '',
  updatedAt: '',
}

export function SettingsPage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [backupInfo, setBackupInfo] = useState<BackupMetadata | null>(null)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restockTaxSales, setRestockTaxSales] = useState('18')
  const [restockTaxAdvance, setRestockTaxAdvance] = useState('0.1')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProfile(await api.businessProfile.get())
      const [sales, advance] = await Promise.all([
        api.settings.getValue(PURCHASE_SALES_TAX_SETTING),
        api.settings.getValue(PURCHASE_ADVANCE_TAX_SETTING),
      ])
      if (sales != null) setRestockTaxSales(String((parseFloat(sales) / 100).toFixed(2)))
      if (advance != null) setRestockTaxAdvance(String((parseFloat(advance) / 100).toFixed(2)))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleRestockTaxSave = async () => {
    setActionError(null)
    setActionSuccess(null)
    const sales = parseFloat(restockTaxSales)
    const advance = parseFloat(restockTaxAdvance)
    if (Number.isNaN(sales) || sales < 0 || Number.isNaN(advance) || advance < 0) {
      setActionError('Tax rates must be 0 or more')
      return
    }
    try {
      await api.settings.bulkUpdate({
        settings: [
          { key: PURCHASE_SALES_TAX_SETTING, value: String(Math.round(sales * 100)) },
          { key: PURCHASE_ADVANCE_TAX_SETTING, value: String(Math.round(advance * 100)) },
        ],
      })
      setActionSuccess('Purchase tax defaults saved')
    } catch (e) {
      setActionError(String(e))
    }
  }

  const handleBackup = async () => {
    setActionError(null)
    setActionSuccess(null)
    const result = await api.dialogs.saveFile({
      defaultPath: `MajidZiaTraders-backup-${localDate()}.db`,
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return
    try {
      const meta = await api.backup.create(result.filePath)
      setBackupInfo(meta)
      setActionSuccess(`Backup created: ${result.filePath}`)
    } catch (e) {
      setActionError(String(e))
    }
  }

  const handleRestore = async () => {
    setActionError(null)
    setActionSuccess(null)
    const file = await api.dialogs.selectFile({
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })
    if (file.canceled || !file.filePath) return
    try {
      const validation = await api.backup.validate(file.filePath)
      if (!validation.valid) {
        setActionError(`Invalid backup: ${validation.message}`)
        return
      }
      const confirmed = window.confirm(
        `${validation.message}\n\nRestoring will replace all current data. A copy of your current data is saved first. Continue?`
      )
      if (!confirmed) return
      setRestoreBusy(true)
      const result = await api.backup.restore(file.filePath)
      if (result.success) {
        // Reload so every screen (and the currency) reflects the restored data.
        window.alert(result.message)
        window.location.reload()
        return
      }
      setActionError(result.message)
    } catch (e) {
      setActionError(String(e))
    } finally {
      setRestoreBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="feature">
        <div className="muted">Loading settings…</div>
      </div>
    )
  }

  return (
    <div className="feature">
      <h3 className="toolbar-title">Settings</h3>

      {renderError(error, actionError)}
      {actionSuccess && <div className="form-success">{actionSuccess}</div>}

      <section className="settings-section">
        <div className="settings-header">
          <h4 className="section-title">Business profile</h4>
          <button className="btn" onClick={() => setFormOpen(true)}>
            {profile ? 'Edit' : 'Create'}
          </button>
        </div>
        {profile ? (
          <div className="profile-grid">
            <div className="kv">
              <span className="muted">Business name</span>
              <strong>{profile.name}</strong>
            </div>
            <div className="kv">
              <span className="muted">Owner</span>
              <strong>{profile.ownerName ?? '—'}</strong>
            </div>
            <div className="kv">
              <span className="muted">Phone</span>
              <strong>{profile.phone ?? '—'}</strong>
            </div>
            <div className="kv">
              <span className="muted">Email</span>
              <strong>{profile.email ?? '—'}</strong>
            </div>
            <div className="kv">
              <span className="muted">Address</span>
              <strong>{[profile.address, profile.city, profile.country].filter(Boolean).join(', ') || '—'}</strong>
            </div>
            <div className="kv">
              <span className="muted">Tax ID</span>
              <strong>{profile.taxId ?? '—'}</strong>
            </div>
            <div className="kv">
              <span className="muted">Default tax rate</span>
              <strong>{profile.taxRate}%</strong>
            </div>
            <div className="kv">
              <span className="muted">Currency</span>
              <strong>{profile.currency}</strong>
            </div>
            <div className="kv">
              <span className="muted">Invoice prefix</span>
              <strong>{profile.invoicePrefix || 'INV-'}</strong>
            </div>
            <div className="kv">
              <span className="muted">Invoice footer</span>
              <strong>{profile.invoiceFooter ?? '—'}</strong>
            </div>
          </div>
        ) : (
          <div className="muted">
            No business profile configured. Click <button className="btn small" onClick={() => setFormOpen(true)}>Create</button> to set it up.
          </div>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-header">
          <h4 className="section-title">Purchase (restock) tax defaults</h4>
        </div>
        <p className="muted fine-text">
          Sales tax is charged on statutory retail value; advance tax (Pakistan) is a low flat rate.
          New restock lines default to these rates but each line can override them.
        </p>
        <div className="settings-actions">
          <label className="field">
            <span>Sales tax (%)</span>
            <input
              type="number"
              step="0.01"
              min={0}
              value={restockTaxSales}
              onChange={(e) => setRestockTaxSales(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Advance tax (%)</span>
            <input
              type="number"
              step="0.01"
              min={0}
              value={restockTaxAdvance}
              onChange={(e) => setRestockTaxAdvance(e.target.value)}
            />
          </label>
          <button className="btn primary" onClick={() => void handleRestockTaxSave()}>
            Save
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h4 className="section-title">Backup & restore</h4>
        <p className="muted fine-text">
          Backups create a single offline .db file containing all your data. Restoring replaces
          everything with the selected backup.
        </p>
        <div className="settings-actions">
          <button className="btn primary" onClick={() => void handleBackup()}>
            Create backup…
          </button>
          <button className="btn" onClick={() => void handleRestore()} disabled={restoreBusy}>
            {restoreBusy ? 'Restoring…' : 'Restore from backup…'}
          </button>
        </div>
        {backupInfo && (
          <div className="muted fine-text">
            Last backup: {backupInfo.fileName} · {formatDateTime(backupInfo.createdAt)} ·{' '}
            {Math.round(backupInfo.size / 1024)} KB
          </div>
        )}
      </section>

      {formOpen && (
        <ProfileForm
          initial={profile ?? EMPTY_PROFILE}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false)
            await load()
          }}
        />
      )}
    </div>
  )
}

function renderError(error: string | null, actionError: string | null) {
  if (actionError)
    return (
      <div className="form-error">{actionError}</div>
    )
  if (error) return <div className="form-error">{error}</div>
  return null
}

function ProfileForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: BusinessProfile
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [state, setState] = useState({
    name: initial.name,
    ownerName: initial.ownerName ?? '',
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    address: initial.address ?? '',
    city: initial.city ?? '',
    country: initial.country ?? '',
    taxId: initial.taxId ?? '',
    taxRate: String(initial.taxRate),
    currency: initial.currency || 'USD',
    invoicePrefix: initial.invoicePrefix || 'INV-',
    invoiceFooter: initial.invoiceFooter ?? '',
  })
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!state.name.trim()) {
      setServerError('Business name is required')
      return
    }
    setSaving(true)
    try {
      await api.businessProfile.update({
        name: state.name.trim(),
        ownerName: state.ownerName.trim() || null,
        phone: state.phone.trim() || null,
        email: state.email.trim() || null,
        address: state.address.trim() || null,
        city: state.city.trim() || null,
        country: state.country.trim() || null,
        taxId: state.taxId.trim() || null,
        taxRate: Math.min(100, Math.max(0, parseFloat(state.taxRate || '0') || 0)),
        currency: state.currency.trim() || 'USD',
        invoicePrefix: state.invoicePrefix.trim() || 'INV-',
        invoiceFooter: state.invoiceFooter.trim() || null,
      })
      setCurrency(state.currency.trim() || 'USD')
      await onSaved()
    } catch (err) {
      setServerError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const fields: Array<{ key: keyof typeof state; label: string; span?: boolean }> = [
    { key: 'name', label: 'Business name *' },
    { key: 'ownerName', label: 'Owner' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'address', label: 'Address', span: true },
    { key: 'city', label: 'City' },
    { key: 'country', label: 'Country' },
    { key: 'taxId', label: 'Tax ID' },
    { key: 'taxRate', label: 'Default tax rate (%)' },
    { key: 'currency', label: 'Currency (ISO code)' },
    { key: 'invoicePrefix', label: 'Invoice prefix' },
    { key: 'invoiceFooter', label: 'Invoice footer', span: true },
  ]

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal profile-form" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="modal-header">
          <h3>Edit business profile</h3>
          <button type="button" className="btn ghost icon" onClick={onClose} aria-label="Close" title="Close">
            ✕
          </button>
        </div>
        <div className="form-grid">
          {fields.map((f) => (
            <label key={f.key} className={`field${f.span ? ' field-span-2' : ''}`}>
              <span>{f.label}</span>
              <input
                value={state[f.key]}
                onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {serverError && <div className="form-error">{serverError}</div>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}