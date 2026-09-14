/**
 * Print layout helpers for the load-form bulk print.
 *
 * The bulk print runs the load form first (its own full page) and then every
 * linked invoice, two invoices per landscape A4 page. These helpers express
 * that pagination and ordering as pure data so the UI and the tests share one
 * source of truth.
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

/** A print block: the load form, or one linked invoice. */
export type BulkPrintSection = 'load-form' | 'invoice'

/**
 * The order of print blocks for a bulk print: the load form always comes
 * first, followed by every linked invoice in the order they were selected.
 */
export function bulkPrintOrder(invoiceCount: number): BulkPrintSection[] {
  const sections: BulkPrintSection[] = ['load-form']
  for (let i = 0; i < invoiceCount; i++) {
    sections.push('invoice')
  }
  return sections
}

export interface BulkPrintPlan {
  /** The load form always takes its own leading page. */
  loadFormPageCount: 1
  /** Landscape A4 pages needed for the invoices at two per page. */
  invoicePageCount: number
}

/** Total physical pages the bulk print consumes: load form page + invoice pages. */
export function planBulkPrint(invoiceCount: number): BulkPrintPlan {
  return { loadFormPageCount: 1, invoicePageCount: Math.ceil(invoiceCount / 2) }
}