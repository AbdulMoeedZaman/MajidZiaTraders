import { ActionLogRepository } from '../repositories/action-log.repository'
import type { ActionLog, HistoryActionType } from '@shared/types/history'

/** Data a domain service records in the audit log. */
export interface AppendLogData {
  action: HistoryActionType
  targetType: string
  targetId: number | null
  summary: string
  snapshot: Record<string, unknown> | null
}

/**
 * Audit log. Every recorded action is appended inside the domain service's own
 * transaction (this service never opens a transaction). It only records what
 * happened; it cannot undo or redo anything.
 */
export class HistoryService {
  private logRepo = new ActionLogRepository()

  list(): ActionLog[] {
    return this.logRepo.findAll()
  }

  recent(limit: number): ActionLog[] {
    return this.logRepo.findAll({ limit })
  }

  /** Called by domain services inside their own transaction. */
  append(data: AppendLogData): void {
    this.logRepo.insert(data)
  }
}