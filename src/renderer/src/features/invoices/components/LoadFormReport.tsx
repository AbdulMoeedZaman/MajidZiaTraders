import { flushSync } from 'react-dom'
import { useState } from 'react'
import { LoadFormSheet } from './LoadFormSheet'
import { LoadFormBulkPrint, type BulkPrintData } from './LoadFormBulkPrint'
import { prepareBulkPrintData } from '../../../lib/bulk-print'
import type { LoadFormSummary } from '@shared/types/invoice'

interface Props {
  summary: LoadFormSummary
  /** Ordered IDs of the invoices in the load form (used by the bulk print). */
  invoiceIds: number[]
  onClose: () => void
  /** Label for the onClose button (defaults to "Back to Invoices"). */
  backLabel?: string
}

export function LoadFormReport({ summary, invoiceIds, onClose, backLabel = 'Back to Invoices' }: Props) {
  const [bulk, setBulk] = useState<BulkPrintData | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)

  /** Prints just the load form on a portrait A4 page. */
  const printLoadForm = () => {
    const style = document.createElement('style')
    style.id = 'lf-print-override'
    style.textContent = '@page { size: A4 portrait; margin: 6mm; }'
    document.head.appendChild(style)
    try {
      window.print()
    } finally {
      style.remove()
    }
  }

  /**
   * Prints the load form followed by every linked invoice, two invoices per
   * landscape A4 page, in the order they were added to the load form. When
   * includeLoadForm is false only the invoices are printed.
   */
  const printBulk = async (includeLoadForm: boolean) => {
    if (invoiceIds.length === 0) {
      window.print()
      return
    }
    setPrintError(null)
    setPreparing(true)
    try {
      const data = await prepareBulkPrintData(summary, invoiceIds, includeLoadForm)

      // Commit the print-only tree synchronously so it is in the DOM (with the
      // `bulk-printing` body class applied) before we open the print dialog.
      flushSync(() => setBulk(data))

      let failed = false
      try {
        window.print()
      } catch {
        failed = true
      } finally {
        setBulk(null)
      }
      if (failed) setPrintError('The print dialog could not be opened')
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : 'Failed to prepare the bulk print')
    } finally {
      setPreparing(false)
    }
  }

  const printLoadFormWithInvoices = () => printBulk(true)

  const printInvoicesOnly = () => printBulk(false)

  return (
    <div className="feature load-form-print">
      <div className="toolbar">
        <div className="spacer" />
        {invoiceIds.length > 0 && (
          <span className="muted fine-text">
            {summary.invoiceNumbers.length} invoice{summary.invoiceNumbers.length === 1 ? '' : 's'}
          </span>
        )}
        <button className="btn ghost" onClick={onClose}>
          {backLabel}
        </button>
        <button
          className="btn ghost"
          onClick={printLoadForm}
          disabled={preparing || bulk !== null}
        >
          🖨 Print Load Form
        </button>
        <button
          className="btn ghost"
          onClick={() => void printInvoicesOnly()}
          disabled={preparing || bulk !== null}
        >
          {preparing ? 'Preparing…' : '🖨 Print Invoices'}
        </button>
        <button
          className="btn primary"
          onClick={() => void printLoadFormWithInvoices()}
          disabled={preparing || bulk !== null}
        >
          {preparing ? 'Preparing…' : '🖨 Print Load Form + Invoices'}
        </button>
      </div>

      {printError && <div className="form-error">{printError}</div>}

      <LoadFormSheet summary={summary} />

      {bulk && <LoadFormBulkPrint data={bulk} />}
    </div>
  )
}