export interface BackupMetadata {
  fileName: string
  size: number
  createdAt: string
  appVersion: string
  tableCount: number
}

export interface BackupValidation {
  valid: boolean
  message: string
  integrity: boolean
  tables: string[]
  /** Database format version of the backup (highest applied migration), if known. */
  version: number | null
  metadata: BackupMetadata | null
}

export interface BackupRestoreResult {
  success: boolean
  message: string
  restoredAt: string
  /** Copy of the data that was in the app just before the restore. */
  safetyCopyPath: string | null
}