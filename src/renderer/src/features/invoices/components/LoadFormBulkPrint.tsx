import { useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { InvoiceSheet } from './InvoiceSheet'
import { LoadFormSheet } from './LoadFormSheet'
import { groupIntoTwoUp } from '../../../lib/load-form-print'
import type { InvoiceDetails, LoadFormSummary } from '@shared/types/invoice'

export interface BulkPrintData {
  summary: LoadFormSummary
  /** The invoice_description setting shown on each invoice sheet. */
  description: string
  /** Linked invoices in load-form order. */
  invoices: InvoiceDetails[]
}

interface Props {
  data: BulkPrintData
}

/**
 * The print-only tree for a load-form bulk print, mounted into <body> (outside
 * the app root) via a portal. On screen it is hidden; under `@media print` it
 * becomes the entire page: the load form first, then every invoice laid out
 * two-per-landscape-page. Odd invoice counts leave the last page's second
 * column blank.
 *
 * Adds the `bulk-printing` body class while mounted so the print styles can
 * suppress the app and expose only this tree.
 */
export function LoadFormBulkPrint({ data }: Props) {
  useLayoutEffect(() => {
    document.body.classList.add('bulk-printing')
    return () => document.body.classList.remove('bulk-printing')
  }, [])

  const pages = groupIntoTwoUp(data.invoices)

  return createPortal(
    <div className="bulk-print" aria-hidden="true">
      <div className="print-page lf-page">
        <LoadFormSheet summary={data.summary} />
      </div>

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