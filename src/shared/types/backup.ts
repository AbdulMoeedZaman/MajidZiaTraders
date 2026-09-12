export interface BackupFileInfo {
  name: string
  path: string
  size: number
  createdAt: string
}

export interface BackupValidation {
  valid: boolean
  message: string
  /** Schema version recorded in the backup's _migrations table (null when unreadable). */
  version: number | null
}

export interface BackupRestoreResult {
  message: string
  /** Path of the automatic "before-restore" safety copy kept in userData/backups. */
  safetyPath: string
  version: number | null
}

export interface DialogResult {
  canceled: boolean
  path: string | null
}