import path from 'path'
import { app } from 'electron'

export const CSV_READ_EXTENSIONS = ['.csv', '.txt', '.tsv']
export const CSV_WRITE_EXTENSIONS = ['.csv', '.txt']
export const BACKUP_EXTENSIONS = ['.db', '.sqlite', '.sqlite3']

/**
 * Checks a file path that came from the renderer before the main process reads or writes it:
 * it must be absolute, have an expected extension, and must not point inside the app's own
 * data folder (so an export can never overwrite the live database).
 */
export function assertUserFilePath(filePath: unknown, allowedExtensions: string[], purpose: string): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error(`${purpose}: a file path is required`)
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error(`${purpose}: the file path must be absolute`)
  }
  const resolved = path.resolve(filePath)
  const ext = path.extname(resolved).toLowerCase()
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`${purpose}: only ${allowedExtensions.join(', ')} files are allowed`)
  }
  const userData = path.resolve(app.getPath('userData'))
  if (resolved === userData || resolved.startsWith(userData + path.sep)) {
    throw new Error(`${purpose}: choose a location outside the app's data folder`)
  }
  return resolved
}
