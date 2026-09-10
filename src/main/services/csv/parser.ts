export interface ParsedCSV {
  header: string[]
  rows: string[][]
}

export function parseCSV(text: string, delimiter = ','): ParsedCSV {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  // Drop trailing all-empty rows.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) {
    rows.pop()
  }

  return {
    header: rows.length > 0 ? rows[0] : [],
    rows,
  }
}

export function toCSV(columns: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    const str = String(value)
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines: string[] = []
  lines.push(columns.map(escape).join(','))
  for (const row of rows) {
    lines.push(columns.map((col) => escape(row[col])).join(','))
  }
  return lines.join('\r\n')
}

export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4096)
  const candidates = [',', '\t', ';', '|']
  let best = ','
  let bestCount = 0
  for (const candidate of candidates) {
    if (!sample.includes(candidate)) continue
    const cleaned = sample.replace(/"[^"]*"/g, '')
    const count = cleaned.split(candidate).length - 1
    if (count > bestCount) {
      bestCount = count
      best = candidate
    }
  }
  return best
}

export function parseMoneyCell(value: string, field: string): { value: number; error?: string } {
  const trimmed = value.trim()
  if (trimmed === '') return { value: 0 }
  const parsed = Number(trimmed)
  if (Number.isNaN(parsed)) {
    return { value: 0, error: `${field} must be a number` }
  }
  if (!Number.isFinite(parsed)) {
    return { value: 0, error: `${field} must be a finite number` }
  }
  const cents = Math.round(parsed * 100)
  if (!Number.isSafeInteger(cents)) {
    return { value: 0, error: `${field} is out of range` }
  }
  return { value: cents }
}

export function parseIntCell(value: string, field: string): { value: number; error?: string } {
  const trimmed = value.trim()
  if (trimmed === '') return { value: 0 }
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed)) {
    return { value: 0, error: `${field} must be a whole number` }
  }
  return { value: parsed }
}