import { flushSync } from 'react-dom'
import { useState } from 'react'
import { api } from '../../../lib/api'
import { LoadFormSheet } from './LoadFormSheet'
import { LoadFormBulkPrint, type BulkPrintData } from './LoadFormBulkPrint'
import type { LoadFormSummary } from '@shared/types/invoice'

interface Props {
  summary: LoadFormSummary
  /** Ordered IDs of the invoices in the load form (used by the bulk print). */
  invoiceIds: number[]
  onClose: () => void
}

export function LoadFormReport({ summary, invoiceIds, onClose }: Props) {
  const [bulk, setBulk] = useState<BulkPrintData | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)

  /** Existing behavior: prints just the load form sheet on screen. */
  const printLoadForm = () => window.print()

  /**
   * Prints the load form followed by every linked invoice, two invoices per
   * landscape A4 page, in the order they were added to the load form.
   */
  const printLoadFormWithInvoices = async () => {
    if (invoiceIds.length === 0) {
      window.print()
      return
    }
    setPrintError(null)
    setPreparing(true)
    try {
      const [description, loaded] = await Promise.all([
        api.settings.getValue('invoice_description').catch(() => ''),
        Promise.all(
          invoiceIds.map(async (id) => {
            const details = await api.invoices.getWithDetails(id)
            if (!details) {
              throw new Error('Could not load every invoice for printing')
            }
            return details
          })
        ),
      ])

      // Commit the print-only tree synchronously so it is in the DOM (with the
      // `bulk-printing` body class applied) before we open the print dialog.
      flushSync(() =>
        setBulk({ summary, description: description ?? '', invoices: loaded })
      )

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

  return (
    <div className="feature">
      <div className="toolbar">
        <div className="spacer" />
        {invoiceIds.length > 0 && (
          <span className="muted fine-text">
            {summary.invoiceNumbers.length} invoice{summary.invoiceNumbers.length === 1 ? '' : 's'}
          </span>
        )}
        <button className="btn ghost" onClick={onClose}>
          Back to Invoices
        </button>
        <button
          className="btn ghost"
          onClick={printLoadForm}
          disabled={preparing || bulk !== null}
        >
          🖨 Print Load Form
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