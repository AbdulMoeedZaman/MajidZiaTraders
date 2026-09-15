import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import type { ProjectOwner } from '@shared/types/project-owner'
import type { Broker } from '@shared/types/broker'
import type { BackupValidation } from '@shared/types/backup'
import { AdjustmentsPage } from '../../adjust/components/AdjustmentsPage'
import { HistoryPage } from '../../history/components/HistoryPage'
import { DataTransferModal } from './DataTransferModal'

interface OwnerFormData {
  name: string
  phone: string
  address: string
}

interface BrokerFormData {
  name: string
  phone: string
}

interface Props {
  initial?: ProjectOwner | null
  onSave: (data: OwnerFormData) => Promise<void>
  onCancel: () => void
}

function OwnerForm({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setError(null)
    if (!name.trim()) {
      setError('Owner name is required')
      return
    }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), phone: phone.trim(), address: address.trim() })
      onCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save owner')
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{initial ? 'Edit Project Owner' : 'Add Project Owner'}</h3>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <label className="field field-span-2">
            <span>Name</span>
            <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="field">
            <span>Address</span>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface BrokerProps {
  initial?: Broker | null
  onSave: (data: BrokerFormData) => Promise<void>
  onCancel: () => void
}

function BrokerForm({ initial, onSave, onCancel }: BrokerProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setError(null)
    if (!name.trim()) {
      setError('Booker name is required')
      return
    }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), phone: phone.trim() })
      onCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save booker')
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{initial ? 'Edit Booker' : 'Add Booker'}</h3>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const execCmd = (cmd: string, arg?: string) => {
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, arg)
  }

  return (
    <div className="richtext-editor">
      <div className="richtext-toolbar">
        <button type="button" className="btn ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('bold')}>
          <b>B</b>
        </button>
        <button type="button" className="btn ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('italic')}>
          <i>I</i>
        </button>
        <button type="button" className="btn ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd('underline')}>
          <u>U</u>
        </button>
        <button
          type="button"
          className="btn ghost small"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCmd('insertUnorderedList')}
        >
          • List
        </button>
        <button
          type="button"
          className="btn ghost small"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCmd('insertOrderedList')}
        >
          1. List
        </button>
        <button
          type="button"
          className="btn ghost small"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCmd('removeFormat')}
        >
          Clear
        </button>
      </div>
      <div
        className="richtext-area"
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onKeyUp={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        data-placeholder="Invoice description / terms printed under the signature…"
      />
    </div>
  )
}

export function SettingsPage() {
  const [owners, setOwners] = useState<ProjectOwner[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ownerModal, setOwnerModal] = useState<{ open: boolean; editing: ProjectOwner | null }>({
    open: false,
    editing: null,
  })
  const [brokerModal, setBrokerModal] = useState<{ open: boolean; editing: Broker | null }>({
    open: false,
    editing: null,
  })
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'owner' | 'broker'
    id: number
  } | null>(null)
  const [descSaving, setDescSaving] = useState(false)
  const [descMessage, setDescMessage] = useState<string | null>(null)
  const [descError, setDescError] = useState<string | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [restorePick, setRestorePick] = useState<{
    path: string
    name: string
    validation: BackupValidation
  } | null>(null)
  const [pageModal, setPageModal] = useState<'adjust' | 'history' | null>(null)
  const [dataTransferOpen, setDataTransferOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [o, b, d] = await Promise.all([
        api.projectOwners.list(),
        api.brokers.list(),
        api.settings.getValue('invoice_description'),
      ])
      setOwners(o)
      setBrokers(b)
      setDescription(d ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const saveOwner = async (data: OwnerFormData) => {
    if (ownerModal.editing) {
      await api.projectOwners.update(ownerModal.editing.id, data)
    } else {
      await api.projectOwners.create(data)
    }
    await load()
    setOwnerModal({ open: false, editing: null })
  }

  const saveBroker = async (data: BrokerFormData) => {
    if (brokerModal.editing) {
      await api.brokers.update(brokerModal.editing.id, data)
    } else {
      await api.brokers.create(data)
    }
    await load()
    setBrokerModal({ open: false, editing: null })
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      if (confirmDelete.type === 'owner') {
        await api.projectOwners.delete(confirmDelete.id)
      } else {
        await api.brokers.delete(confirmDelete.id)
      }
      setConfirmDelete(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
      setConfirmDelete(null)
    }
  }

  const saveDescription = async () => {
    setDescSaving(true)
    setDescMessage(null)
    setDescError(null)
    try {
      await api.settings.set('invoice_description', description, 'richtext')
      setDescMessage('Description saved')
    } catch (e) {
      setDescError(e instanceof Error ? e.message : 'Failed to save description')
    } finally {
      setDescSaving(false)
    }
  }

  const createBackup = async () => {
    setBackupBusy(true)
    setBackupMessage(null)
    setBackupError(null)
    try {
      const pick = await api.dialogs.saveBackup()
      if (pick.canceled || !pick.path) return
      const file = await api.backup.create(pick.path)
      setBackupMessage(`Backup saved: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`)
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'Failed to create backup')
    } finally {
      setBackupBusy(false)
    }
  }

  const pickRestore = async () => {
    setBackupBusy(true)
    setBackupMessage(null)
    setBackupError(null)
    try {
      const pick = await api.dialogs.openBackup()
      if (pick.canceled || !pick.path) return
      const validation = await api.backup.validate(pick.path)
      if (!validation.valid) {
        setBackupError(validation.message)
        return
      }
      setRestorePick({
        path: pick.path,
        name: pick.path.split(/[\\/]/).pop() ?? pick.path,
        validation,
      })
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'Failed to read backup')
    } finally {
      setBackupBusy(false)
    }
  }

  const confirmRestore = async () => {
    if (!restorePick) return
    setBackupBusy(true)
    setBackupError(null)
    try {
      await api.backup.restore(restorePick.path)
      setRestorePick(null)
      window.location.reload()
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'Failed to restore backup')
      setBackupBusy(false)
    }
  }

  if (loading) return <div className="placeholder"><h3>Loading settings…</h3></div>
  if (error) return <div className="error-screen">{error}</div>

  return (
    <div className="feature">
      <div className="settings-section">
        <div className="section-title">Adjustments &amp; History</div>
        <div className="settings-intro">
          Correct a stock entry or a recorded payment, or review the action log.
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={() => setPageModal('adjust')}>
            ✎ Adjustments
          </button>
          <button className="btn ghost" onClick={() => setPageModal('history')}>
            ⌛ History
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Import / Export Data</div>
        <div className="settings-intro">
          Download your products, customers or invoices as CSV files, or import them back from a
          filled-in template (e.g. to merge data on a new machine).
        </div>
        <div className="form-actions">
          <button className="btn ghost" onClick={() => setDataTransferOpen(true)}>
            ⇅ Import / Export Data
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Project Owner</div>
        <div className="settings-intro">
          The project owner appears at the top of the printed invoice. This owner must be set
          up before any invoice can be created.
        </div>
        {owners.length === 0 ? (
          <div className="empty-state">
            <p>No project owner set up yet.</p>
            <div className="form-actions">
              <button
                className="btn primary"
                onClick={() => setOwnerModal({ open: true, editing: null })}
              >
                + Set Up Project Owner
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-owner-card">
            {owners.map((o) => (
              <div className="settings-owner-row" key={o.id}>
                <div className="settings-owner-info">
                  <strong>{o.name}</strong>
                  {o.phone && <span>{o.phone}</span>}
                  {o.address && <span>{o.address}</span>}
                </div>
                {confirmDelete?.type === 'owner' && confirmDelete.id === o.id ? (
                  <span className="confirm-bar">
                    <button className="btn danger small" onClick={() => void handleDelete()}>
                      Confirm
                    </button>
                    <button className="btn ghost small" onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="actions-col">
                    <button
                      className="btn ghost small"
                      onClick={() => setOwnerModal({ open: true, editing: o })}
                    >
                      Edit
                    </button>
                    <button
                      className="btn danger small"
                      onClick={() => setConfirmDelete({ type: 'owner', id: o.id })}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-section">
        <div className="section-title">Bookers (Brokers)</div>
        <div className="settings-intro">
          The booker is selected on every invoice and printed next to the invoice number.
        </div>
        {brokers.length === 0 ? (
          <div className="empty-state">
            <p>No bookers yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {brokers.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>{b.phone || '—'}</td>
                    <td className="actions-col">
                      {confirmDelete?.type === 'broker' && confirmDelete.id === b.id ? (
                        <span className="confirm-bar">
                          <button className="btn danger small" onClick={() => void handleDelete()}>
                            Confirm
                          </button>
                          <button className="btn ghost small" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <>
                          <button
                            className="btn ghost small"
                            onClick={() => setBrokerModal({ open: true, editing: b })}
                          >
                            Edit
                          </button>
                          <button
                            className="btn danger small"
                            onClick={() => setConfirmDelete({ type: 'broker', id: b.id })}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-actions">
          <button
            className="btn ghost"
            onClick={() => setBrokerModal({ open: true, editing: null })}
          >
            + Add Booker
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Invoice Description</div>
        <div className="settings-intro">
          Centered below the signature on every printed invoice. Use it for payment notes,
          policy terms, or contact details.
        </div>
        <RichTextEditor value={description} onChange={setDescription} />
        {descError && <div className="form-error">{descError}</div>}
        {descMessage && <div className="text-ok fine-text">{descMessage}</div>}
        <div className="form-actions">
          <button className="btn primary" onClick={() => void saveDescription()} disabled={descSaving}>
            {descSaving ? 'Saving…' : 'Save Description'}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Backup &amp; Restore</div>
        <div className="settings-intro">
          Create a backup to save the whole database (customers, products, stock, invoices,
          settings) to a .db file, e.g. on a USB drive. Restoring replaces all current data —
          the app first saves an automatic before-restore copy of today&apos;s database so
          nothing is lost.
        </div>
        {backupError && <div className="form-error">{backupError}</div>}
        {backupMessage && <div className="text-ok fine-text">{backupMessage}</div>}
        <div className="form-actions">
          <button className="btn primary" onClick={() => void createBackup()} disabled={backupBusy}>
            {backupBusy ? 'Working…' : 'Create backup…'}
          </button>
          <button className="btn ghost" onClick={() => void pickRestore()} disabled={backupBusy}>
            Restore from backup…
          </button>
        </div>
      </div>

      {ownerModal.open && (
        <OwnerForm
          initial={ownerModal.editing}
          onSave={saveOwner}
          onCancel={() => setOwnerModal({ open: false, editing: null })}
        />
      )}
      {brokerModal.open && (
        <BrokerForm
          initial={brokerModal.editing}
          onSave={saveBroker}
          onCancel={() => setBrokerModal({ open: false, editing: null })}
        />
      )}
      {restorePick && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Restore backup</h3>
            </div>
            <p className="fine-text">
              Restore <strong>{restorePick.name}</strong>? All current data will be replaced by
              the backup&apos;s data
              {restorePick.validation.version !== null
                ? ` (backup schema version ${restorePick.validation.version})`
                : ''}
              . An automatic copy of today&apos;s database is saved first in case you need to go
              back.
            </p>
            <div className="form-actions">
              <button className="btn ghost" onClick={() => setRestorePick(null)} disabled={backupBusy}>
                Cancel
              </button>
              <button className="btn danger" onClick={() => void confirmRestore()} disabled={backupBusy}>
                {backupBusy ? 'Working…' : 'Restore now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pageModal && (
        <div className="overlay">
          <div className="modal modal-page">
            <div className="modal-header">
              <h3>{pageModal === 'adjust' ? 'Adjustments' : 'History'}</h3>
              <div className="modal-actions">
                <button className="btn ghost small" onClick={() => setPageModal(null)}>
                  Close
                </button>
              </div>
            </div>
            {pageModal === 'adjust' ? <AdjustmentsPage /> : <HistoryPage />}
          </div>
        </div>
      )}

      {dataTransferOpen && <DataTransferModal onClose={() => setDataTransferOpen(false)} />}
    </div>
  )
}