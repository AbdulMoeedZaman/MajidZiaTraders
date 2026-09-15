import { useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { InvoiceSheet } from './InvoiceSheet'
import { LoadFormSheet } from './LoadFormSheet'
import { groupIntoTwoUp, planInvoicePages } from '../../../lib/load-form-print'
import type { InvoiceDetails, LoadFormSummary } from '@shared/types/invoice'

export interface BulkPrintData {
  summary: LoadFormSummary
  /** The invoice_description setting shown on each invoice sheet. */
  description: string
  /** Linked invoices in load-form order. */
  invoices: InvoiceDetails[]
  /** When false, skip the lead load-form/invoice page (invoices-only print). */
  includeLoadForm?: boolean
}

interface Props {
  data: BulkPrintData
}

/**
 * The print-only tree for a load-form bulk print, mounted into <body> (outside
 * the app root) via a portal. On screen it is hidden; under `@media print` it
 * becomes the entire page:
 *
 * - Page one holds the load form together with the first invoice.
 * - The remaining invoices follow two per landscape page (page two holds
 *   invoices #2 and #3, page three holds #4 and #5, and so on). Odd trailing
 *   counts leave the last page's second column blank.
 *
 * When `includeLoadForm` is false, only the invoices are printed, two per
 * page from the first.
 *
 * Adds the `bulk-printing` body class while mounted so the print styles can
 * suppress the app and expose only this tree.
 */
export function LoadFormBulkPrint({ data }: Props) {
  useLayoutEffect(() => {
    document.body.classList.add('bulk-printing')
    return () => document.body.classList.remove('bulk-printing')
  }, [])

  const { leading, pages } = data.includeLoadForm === false
    ? { leading: null as null, pages: groupIntoTwoUp(data.invoices) }
    : planInvoicePages(data.invoices)

  return createPortal(
    <div className="bulk-print" aria-hidden="true">
      {data.includeLoadForm !== false && (
        <div className="print-page two-up">
          <div className="two-col">
            <LoadFormSheet summary={data.summary} />
          </div>
          <div className="two-col">
            {leading ? (
              <InvoiceSheet details={leading} description={data.description} />
            ) : null}
          </div>
        </div>
      )}

      {pages.map((page, i) => (
        <div className="print-page two-up" key={i}>
          <div className="two-col">
            <InvoiceSheet details={page.first} description={data.description} />
          </div>
          <div className="two-col">
            {page.second ? (
              <InvoiceSheet details={page.second} description={data.description} />
            ) : null}
          </div>
        </div>
      ))}
    </div>,
    document.body
  )
}