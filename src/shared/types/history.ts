/** Actions the app records in the audit action log. */
export const HISTORY_ACTIONS = [
  'product_created',
  'restocked',
  'payment_recorded',
  'payment_reversed',
  'stock_adjusted',
  'invoice_created',
] as const

export type HistoryActionType = (typeof HISTORY_ACTIONS)[number]

/**
 * Status of a logged action. New rows are always stored as `applied`; the
 * `undone` / `superseded` values only exist in databases upgraded from an app
 * version that had undo/redo, and are retained purely as historical audit data.
 */
export type ActionLogStatus = 'applied' | 'undone' | 'superseded'

export interface ActionLog {
  id: number
  /** Monotonic ordinal; new actions always get the highest seq. */
  seq: number
  action: HistoryActionType
  targetType: string
  targetId: number | null
  summary: string
  /** JSON snapshot of the state at record time. */
  snapshot: Record<string, unknown> | null
  status: ActionLogStatus
  createdAt: string
}