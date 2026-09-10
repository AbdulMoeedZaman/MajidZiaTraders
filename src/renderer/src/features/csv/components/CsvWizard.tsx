import { useCallback, useState } from 'react'
import type { CSVImportEntityType, CSVImportResult, CSVPreviewRow } from '@shared/types/csv'
import { CSV_IMPORT_FIELDS } from '@shared/types/csv'
import { api } from '../../../lib/api'

type Step = 'pick' | 'preview' | 'done'

export function CsvWizard() {
  const [step, setStep] = useState<Step>('pick')
  const [entity, setEntity] = useState<CSVImportEntityType>('products')
  const [preview, setPreview] = useState<CSVPreviewRow | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [delimiter, setDelimiter] = useState(',')
  const [hasHeader, setHasHeader] = useState(true)
  const [mappingOpen, setMappingOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CSVImportResult | null>(null)

  const pickFile = useCallback(async () => {
    setError(null)
    const file = await api.dialogs.selectFile({
      filters: [
        { name: 'CSV files', extensions: ['csv', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (file.canceled || !file.filePath) return
    try {
      const data = await api.csv.preview({ filePath: file.filePath, delimiter, hasHeader })
      setPreview(data)
      setFilePath(file.filePath)
      setStep('preview')
    } catch (e) {
      setError(String(e))
    }
  }, [delimiter, hasHeader])

  const headers = preview?.columns ?? []

  const targetFields = CSV_IMPORT_FIELDS[entity]

  const requiredMapped = targetFields
    .filter((f) => f.required)
    .every((f) => preview && preview.columns.includes(f.key))

  const doImport = useCallback(async () => {
    if (!preview || !filePath) return
    setError(null)
    try {
      const config = {
        entityType: entity,
        filePath,
        delimiter,
        hasHeader,
        encoding: 'utf8',
        columnMappings: headers.map((col) => ({ sourceColumn: col, targetField: col })),
      }
      const res = await api.csv.import(config)
      setResult(res)
      setStep('done')
    } catch (e) {
      setError(String(e))
    }
  }, [preview, filePath, entity, delimiter, hasHeader, headers])

  return (
    <div className="feature">
      <h3 className="toolbar-title">CSV import / export</h3>
      <div className="muted fine-text">
        Import products, customers or restocks from a CSV file. Exports are available from each list
        page (Products, Customers, Restocks, Invoices) and from Reports.
      </div>

      {error && <div className="form-error">{error}</div>}

      {step === 'pick' && (
        <div className="csv-panel">
          <label className="field">
            <span>What are you importing?</span>
            <select value={entity} onChange={(e) => setEntity(e.target.value as CSVImportEntityType)}>
              <option value="products">Products</option>
              <option value="customers">Customers</option>
              <option value="restocks">Restocks</option>
            </select>
          </label>
          <div className="csv-panel-row">
            <label className="field">
              <span>Delimiter</span>
              <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="\t">Tab</option>
              </select>
            </label>
            <label className="field">
              <span>First row is a header</span>
              <select value={hasHeader ? '1' : '0'} onChange={(e) => setHasHeader(e.target.value === '1')}>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </label>
          </div>
          <button className="btn primary" onClick={() => void pickFile()}>
            Choose CSV file…
          </button>
          <div className="muted fine-text">
            Expected {targetFields.length} columns. Required fields:{' '}
            {targetFields.filter((f) => f.required).map((f) => f.label).join(', ')}.
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <>
          <div className="toolbar">
            <span className="muted">
              {preview.totalRows} rows · {preview.columns.length} columns
            </span>
            <div className="spacer" />
            <button className="btn small ghost" onClick={() => setMappingOpen((o) => !o)}>
              Column mapping
            </button>
            <button className="btn secondary" onClick={() => { setPreview(null); setStep('pick') }}>
              Reset
            </button>
            <button className="btn primary" onClick={() => void doImport()} disabled={!requiredMapped}>
              Import
            </button>
          </div>

          {mappingOpen && (
            <div className="csv-mapping">
              <div className="muted fine-text">
                Headers will be matched to target fields by name. Preview rows below map directly.
              </div>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Source column</th>
                    <th>Mapped field</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h) => (
                    <tr key={h}>
                      <td className="mono">{h}</td>
                      <td className="mono">{h || '(unused)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="csv-preview">
            <table className="data-table compact">
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 10).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <div className="csv-result">
          <div className="stat-grid">
            <div className="stat-card ok">
              <div className="stat-label">Imported</div>
              <div className="stat-value">{result.imported}</div>
            </div>
            <div className="stat-card warn">
              <div className="stat-label">Skipped</div>
              <div className="stat-value">{result.skipped}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Duplicates</div>
              <div className="stat-value">{result.duplicates}</div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="table-wrap">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th className="num">Row</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="num">{e.row}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="settings-actions">
            <button className="btn" onClick={() => { setResult(null); setPreview(null); setStep('pick') }}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  )
}