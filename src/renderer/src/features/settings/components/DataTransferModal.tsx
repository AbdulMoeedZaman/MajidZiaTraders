import { useMemo, useState } from 'react'
import { api } from '../../../lib/api'
import type { DataTransferEntity, DataTransferResult } from '@shared/types/data-transfer'

interface Props {
  onClose: () => void
}

const ENTITIES: { value: DataTransferEntity; label: string; description: string }[] = [
  { value: 'products', label: 'Products', description: 'Name, rates and carton size' },
  { value: 'customers', label: 'Customers', description: 'Code, names, contact and route' },
  { value: 'invoices', label: 'Invoices', description: 'One row per product line, grouped by invoice number' },
]

function downloadText(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function errorReportCsv(result: DataTransferResult): string {
  const lines = ['Row,Status,Reason']
  for (const row of result.rows) {
    const cells = [row.row, row.status, row.reason ?? ''].map((cell) => {
      const text = String(cell)
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    })
    lines.push(cells.join(','))
  }
  return '\uFEFF' + lines.join('\n') + '\n'
}

export function DataTransferModal({ onClose }: Props) {
  const [entity, setEntity] = useState<DataTransferEntity>('products')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<DataTransferResult | null>(null)

  const combined = useMemo(() => {
    if (!result) return null
    return {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    }
  }, [result])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () =>
    run(async () => {
      const file = await api.dataTransfer.export(entity)
      downloadText(file.filename, file.csv)
      setMessage(`Downloaded ${file.filename} (exports your current ${entity} data)`)
    })

  const downloadTemplate = () =>
    run(async () => {
      const file = await api.dataTransfer.template(entity)
      downloadText(file.filename, file.csv)
      setMessage(`Downloaded ${file.filename} template`)
    })

  const importCsv = () =>
    run(async () => {
      const pick = await api.dialogs.openCsv()
      if (pick.canceled || !pick.path) return
      const imported = await api.dataTransfer.import(entity, pick.path)
      setResult(imported)
      setMessage(`Imported ${imported.file}`)
    })

  const downloadErrorReport = () => {
    if (!result) return
    const base = (result.file || entity).replace(/\.csv$/i, '')
    downloadText(`${base}-errors.csv`, errorReportCsv(result))
  }

  return (
    <div className="overlay">
      <div className="modal modal-page">
        <div className="modal-header">
          <h3>Import / Export Data</h3>
          <div className="modal-actions">
            <button className="btn ghost small" onClick={onClose} disabled={busy}>
              Close
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div className="dt-entities">
            {ENTITIES.map((entry) => (
              <button
                key={entry.value}
                className={`btn ${entity === entry.value ? 'primary' : 'ghost'} dt-entity`}
                onClick={() => {
                  setEntity(entry.value)
                  setResult(null)
                  setMessage(null)
                  setError(null)
                }}
              >
                <strong>{entry.label}</strong>
                <span>{entry.description}</span>
              </button>
            ))}
          </div>

          <div className="settings-intro">
            <strong>Download data</strong> exports everything you have for {entity} to a CSV file
            (openable in Excel). <strong>Download template</strong> gives you a blank header-only
            file to fill in and import. Fields marked *, like <em>Name*</em>, are required.
          </div>

          {error && <div className="form-error">{error}</div>}
          {message && <div className="text-ok fine-text">{message}</div>}

          <div className="form-actions">
            <button className="btn primary" onClick={() => void exportCsv()} disabled={busy}>
              {busy ? 'Working…' : '⇩ Download data'}
            </button>
            <button className="btn ghost" onClick={() => void downloadTemplate()} disabled={busy}>
              Download template
            </button>
            <button className="btn ghost" onClick={() => void importCsv()} disabled={busy}>
              ⇧ Import from CSV…
            </button>
          </div>

          {entity === 'invoices' && (
            <p className="fine-text">
              One invoice = one CSV row per product line, sharing the same{' '}
              <em>Invoice number*</em>. Numbers that already exist are skipped, stock is
              validated, and the invoice counter is advanced past the largest imported number.
            </p>
          )}
          {entity === 'products' && (
            <p className="fine-text">
              Products are matched by name: an existing name updates the row, a new name creates
              it. Blank <em>Pieces per carton</em> defaults to 1 on create and is left unchanged
              on update.
            </p>
          )}
          {entity === 'customers' && (
            <p className="fine-text">
              Customers are matched by code: an existing code updates the row, a new code creates
              it. The <em>Route*</em> column accepts a route&apos;s name or weekday.
            </p>
          )}

          {combined && result && (
            <div className="dt-summary">
              <div className="section-title">Import result</div>
              <p className="fine-text">
                <span className="text-ok">Created {combined.created}</span>
                <span> · Updated {combined.updated}</span>
                <span> · Skipped {combined.skipped}</span>
                <span className={combined.failed > 0 ? 'text-error' : 'text-ok'}>
                  {' '}
                  · Failed {combined.failed}
                </span>
              </p>
              {combined.failed > 0 && (
                <div className="form-actions">
                  <button className="btn danger small" onClick={downloadErrorReport}>
                    ⇩ Download error report
                  </button>
                </div>
              )}
              {combined.failed > 0 && (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Status</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows
                        .filter((row) => row.status === 'failed' || row.status === 'skipped')
                        .slice(0, 50)
                        .map((row, idx) => (
                          <tr key={idx}>
                            <td>{row.row}</td>
                            <td>{row.status}</td>
                            <td>{row.reason ?? '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {result.rows.length > 50 && (
                    <p className="fine-text">…and more rows in the error report below.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}