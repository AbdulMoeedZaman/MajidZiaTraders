import { useState } from 'react'
import type { Route } from '@shared/types/route'

interface Props {
  routes: Route[]
  onSave: (updates: Array<{ id: number; name: string }>) => Promise<void>
  onCancel: () => void
}

export function RouteNamesModal({ routes, onSave, onCancel }: Props) {
  const [names, setNames] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {}
    for (const r of routes) map[r.id] = r.name
    return map
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setError(null)
    const trimmed = routes.map((r) => ({ id: r.id, name: names[r.id]?.trim() ?? '' }))
    if (trimmed.some((u) => u.name === '')) {
      setError('Every route needs a name')
      return
    }
    const changed = trimmed.filter((u, i) => u.name !== routes[i].name)
    setSaving(true)
    try {
      await onSave(changed)
      onCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save route names')
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Route Names</h3>
          <button className="btn ghost icon" onClick={onCancel} disabled={saving}>
            ✕
          </button>
        </div>
        <div className="settings-intro">
          Each delivery day can be shown under a custom name on the customer page. The
          day itself is fixed; only the display names below are editable.
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid form-grid-2">
          {routes.map((r) => (
            <label className="field" key={r.id}>
              <span>{r.day}</span>
              <input
                type="text"
                value={names[r.id] ?? ''}
                onChange={(e) => setNames((prev) => ({ ...prev, [r.id]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save Route Names'}
          </button>
        </div>
      </div>
    </div>
  )
}