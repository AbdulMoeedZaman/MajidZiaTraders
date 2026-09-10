import { useState } from 'react'
import type { Category } from '@shared/types/category'

interface CategoryManagerProps {
  categories: Category[]
  onCreate: (name: string) => Promise<string | null>
  onRename: (id: number, name: string) => Promise<string | null>
  onSetActive: (id: number, active: boolean) => Promise<string | null>
  onDelete: (id: number) => Promise<string | null>
  onClose: () => void
}

export function CategoryManager({ categories, onCreate, onRename, onSetActive, onDelete, onClose }: CategoryManagerProps) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<string | null>): Promise<boolean> => {
    setError(null)
    setBusy(true)
    try {
      const err = await fn()
      if (err) setError(err)
      return !err
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) {
      setError('Enter a category name')
      return
    }
    if (await run(() => onCreate(newName))) setNewName('')
  }

  const handleSaveRename = async (id: number) => {
    if (!editName.trim()) {
      setError('Category name cannot be empty')
      return
    }
    if (await run(() => onRename(id, editName))) setEditingId(null)
  }

  return (
    <div className="category-manager">
      <form className="add-row" onSubmit={handleAdd}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          aria-label="New category name"
        />
        <button type="submit" className="btn primary" disabled={busy}>
          + Add category
        </button>
      </form>

      {error && <div className="form-error">{error}</div>}

      <div className="table-wrap">
        <table className="data-table compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No categories yet.
                </td>
              </tr>
            )}
            {categories.map((c) => (
              <tr key={c.id}>
                <td>
                  {editingId === c.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label="Category name"
                      autoFocus
                    />
                  ) : (
                    c.name
                  )}
                </td>
                <td>
                  <span className={`badge ${c.isActive === 1 ? 'ok' : 'muted-badge'}`}>
                    {c.isActive === 1 ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="actions-col">
                  {editingId === c.id ? (
                    <>
                      <button className="btn small primary" disabled={busy} onClick={() => void handleSaveRename(c.id)}>
                        Save
                      </button>
                      <button className="btn small ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn small"
                        onClick={() => {
                          setEditingId(c.id)
                          setEditName(c.name)
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="btn small"
                        disabled={busy}
                        onClick={() => void run(() => onSetActive(c.id, c.isActive !== 1))}
                      >
                        {c.isActive === 1 ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn small danger"
                        disabled={busy}
                        onClick={() => {
                          if (confirmDeleteId === c.id) {
                            setConfirmDeleteId(null)
                            void run(() => onDelete(c.id))
                          } else {
                            setConfirmDeleteId(c.id)
                            window.setTimeout(() => setConfirmDeleteId((cur) => (cur === c.id ? null : cur)), 3000)
                          }
                        }}
                      >
                        {confirmDeleteId === c.id ? 'Confirm' : 'Delete'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="fine-text muted">A category that still has products can't be deleted; deactivate it instead.</p>

      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
