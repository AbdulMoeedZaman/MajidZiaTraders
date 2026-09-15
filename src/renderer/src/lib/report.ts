import { localDate } from '@shared/date'

/** A printable / exportable table block (title, headers, body rows and totals). */
export interface ReportSection {
  title: string
  columns: string[]
  rows: string[][]
  /** Extra rows rendered under the body (totals / net lines). */
  foot?: string[][]
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Builds a UTF-8 (BOM) CSV document from one or more sections. Each section is a
 * bracketed title line, its header row, its data rows and its totals, followed
 * by a blank line. Pure string logic so it is unit-testable outside the DOM.
 */
export function buildCsv(sections: ReportSection[]): string {
  const lines: string[] = []
  for (const section of sections) {
    lines.push(`[${section.title}]`)
    lines.push(section.columns.map(csvCell).join(','))
    for (const row of section.rows) {
      lines.push(row.map(csvCell).join(','))
    }
    for (const row of section.foot ?? []) {
      lines.push(row.map(csvCell).join(','))
    }
    lines.push('')
  }
  return `\uFEFF${lines.join('\r\n')}`
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}

/** Downloads `sections` as a single CSV file named after the report title. */
export function exportReportCsv(title: string, sections: ReportSection[]): void {
  const filename = `${slugify(title)}-${localDate()}.csv`
  const blob = new Blob([buildCsv(sections)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Prints a report in-place without opening a popup window (the Electron main
 * process denies `window.open`). Renders a hidden `.report-print` node into
 * `document.body`, marks <body> with `report-printing`, hands the page to
 * `window.print()`, then tears the node down. The matching `@media print` rules
 * in globals.css suppress the app and expose only that node.
 */
export function printReport(title: string, meta: string, sections: ReportSection[]): void {
  const node = document.createElement('div')
  node.className = 'report-print'
  node.innerHTML = buildReportMarkup(title, meta, sections)
  document.body.appendChild(node)
  document.body.classList.add('report-printing')
  try {
    window.print()
  } finally {
    document.body.classList.remove('report-printing')
    node.remove()
  }
}

function buildReportMarkup(title: string, meta: string, sections: ReportSection[]): string {
  const blocks = sections
    .map((section) => {
      const head = section.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
      const rows = section.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell, i) => `<td class="${isNumericColumn(section.columns[i]) ? 'num' : ''}">${escapeHtml(cell)}</td>`)
              .join('')}</tr>`
        )
        .join('')
      const foot = (section.foot ?? [])
        .map(
          (row) =>
            `<tr class="foot">${row
              .map((cell, i) => `<td class="${isNumericColumn(section.columns[i]) ? 'num' : ''}">${escapeHtml(cell)}</td>`)
              .join('')}</tr>`
        )
        .join('')
      return `
        <h2>${escapeHtml(section.title)}</h2>
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>${rows}${foot}</tbody>
        </table>`
    })
    .join('')

  return `
    <h1>${escapeHtml(title)}</h1>
    <p class="report-meta">${escapeHtml(meta)}</p>
    ${blocks}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Short numeric column markers (Quantity, remaining, amounts…). */
const NUMERIC_COLUMNS = new Set(['Quantity', 'Value', 'Price', 'Amount', 'Owed', 'Remaining', 'Sales', 'Profit', 'Invoices', 'Open invoices', 'Grand total', 'Paid'])

function isNumericColumn(name: string): boolean {
  return NUMERIC_COLUMNS.has(name)
}