/** Actions the app records in the action log (each one is reversible). */
export const HISTORY_ACTIONS = [
  'product_created',
  'restocked',
  'payment_recorded',
  'invoice_created',
] as const

export type HistoryActionType = (typeof HISTORY_ACTIONS)[number]

/**
 * Lifecycle of a logged action:
 *  - applied    : the action's effects are the current state of the world.
 *  - undone     : the action was reversed; the lowest-seq undone row is the next
 *                 redo candidate.
 *  - superseded : was undone, but a newer action was applied afterwards, so the
 *                 redo trail of this action is archived for history only.
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
  /** Parsed JSON snapshot used by undo / redo. */
  snapshot: Record<string, unknown> | null
  status: ActionLogStatus
  createdAt: string
}