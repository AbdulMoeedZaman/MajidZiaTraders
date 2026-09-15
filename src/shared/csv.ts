/**
 * Shared CSV parsing and serialising helpers used by both import and export
 * flows (main + renderer). Fields honour RFC-4180 double-quoting.
 */

/** Splits CSV text into rows of fields, honouring double-quoted fields and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0]?.trim() !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.length > 1 || row[0]?.trim() !== '') rows.push(row)
  return rows
}

export type CsvValue = string | number | null | undefined

/** Escapes a single CSV cell for output (quote, comma or newline → quoted). */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** Serialises one row of cells into a single CSV line. */
export function toCsvLine(cells: CsvValue[]): string {
  return cells.map(csvCell).join(',')
}

/** Serialises rows into CSV text. The caller decides whether to prepend a BOM. */
export function toCsvText(rows: CsvValue[][]): string {
  return rows.map(toCsvLine).join('\n') + '\n'
}