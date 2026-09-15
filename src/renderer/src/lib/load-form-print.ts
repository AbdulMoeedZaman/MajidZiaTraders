/**
 * Print layout helpers for the load-form bulk print.
 *
 * The bulk print runs the load form and the first invoice together on page
 * one, then every remaining linked invoice two per landscape A4 page (page
 * two holds invoices #2 and #3, page three holds #4 and #5, and so on).
 * These helpers express that pagination and ordering as pure data so the UI
 * and the tests share one source of truth.
 */

/** One landscape A4 "2-up" page holding up to two portrait invoices. */
export interface TwoUpPage<T> {
  /** Left-hand column invoice. */
  first: T
  /** Right-hand column invoice; null when an odd leftover leaves it blank. */
  second: T | null
}

/**
 * Groups an ordered list into two-per-page pairs, preserving order. With an odd
 * count the final page has a single invoice and a blank second column.
 */
export function groupIntoTwoUp<T>(items: readonly T[]): TwoUpPage<T>[] {
  const pages: TwoUpPage<T>[] = []
  for (let i = 0; i < items.length; i += 2) {
    pages.push({ first: items[i], second: i + 1 < items.length ? items[i + 1] : null })
  }
  return pages
}

/**
 * Splits the invoices for the bulk print: the first invoice is reserved for
 * the load form page (page one), and the remaining invoices are grouped into
 * pairs for the following pages.
 */
export interface InvoicePagePlan<T> {
  /** The first invoice, printed on page one beside the load form (null when none). */
  leading: T | null
  /** The remaining invoices, grouped two per page. */
  pages: TwoUpPage<T>[]
}

export function planInvoicePages<T>(invoices: readonly T[]): InvoicePagePlan<T> {
  if (invoices.length === 0) return { leading: null, pages: [] }
  return { leading: invoices[0], pages: groupIntoTwoUp(invoices.slice(1)) }
}

/** A print block: the load form, or one linked invoice. */
export type BulkPrintSection = 'load-form' | 'invoice'

/**
 * The order of print blocks for a bulk print: the load form always comes
 * first, followed by every linked invoice in the order they were selected.
 * The first invoice shares the load form's page under the print layout.
 */
export function bulkPrintOrder(invoiceCount: number): BulkPrintSection[] {
  const sections: BulkPrintSection[] = ['load-form']
  for (let i = 0; i < invoiceCount; i++) {
    sections.push('invoice')
  }
  return sections
}

export interface BulkPrintPlan {
  /** Page one always exists: the load form next to the first invoice. */
  loadFormPageCount: 1
  /** Landscape A4 pages needed for the invoices after the first, at two per page. */
  invoicePageCount: number
}

/**
 * Total physical pages the bulk print consumes: the load-form page (which
 * also carries the first invoice when there is one) plus the pages holding
 * the remaining invoices two per page.
 */
export function planBulkPrint(invoiceCount: number): BulkPrintPlan {
  const trailing = Math.max(0, invoiceCount - 1)
  return { loadFormPageCount: 1, invoicePageCount: Math.ceil(trailing / 2) }
}