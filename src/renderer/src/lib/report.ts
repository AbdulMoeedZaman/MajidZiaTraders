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
 * Opens a standalone, print-ready window with the report's tables and hands it
 * to the system print dialog. Works for dashboard modals, which sit outside the
 * normal print-on-feature CSS.
 */
export function printReport(title: string, meta: string, sections: ReportSection[]): void {
  const body = sections
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

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #555; margin: 0 0 20px; font-size: 13px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
    th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; text-align: left; }
    th { background: #eee; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody tr.foot td { font-weight: 700; border-top-width: 2px; background: #fafafa; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(meta)}</p>
  ${body}
  <script>
    window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 120); });
  <\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=940,height=680')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
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