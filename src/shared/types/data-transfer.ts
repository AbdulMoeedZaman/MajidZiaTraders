export type DataTransferEntity = 'products' | 'customers' | 'invoices'

export type DataTransferRowStatus = 'created' | 'updated' | 'skipped' | 'failed'

export interface DataTransferRowResult {
  row: number
  status: DataTransferRowStatus
  reason?: string
}

export interface DataTransferResult {
  entity: DataTransferEntity
  file: string
  created: number
  updated: number
  skipped: number
  failed: number
  rows: DataTransferRowResult[]
}

/** A generated CSV file handed to the renderer (template or export). */
export interface DataTransferFile {
  entity: DataTransferEntity
  filename: string
  csv: string
}