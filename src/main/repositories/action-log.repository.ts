import { BaseRepository } from './base.repository'
import type { ActionLog, HistoryActionType } from '@shared/types/history'

/** Raw row as stored (snapshot still a JSON string). */
export interface ActionLogRow {
  id: number
  seq: number
  action: string
  targetType: string
  targetId: number | null
  summary: string
  snapshot: string | null
  status: string
  createdAt: string
}

export class ActionLogRepository extends BaseRepository {
  findAll(opts?: { limit?: number }): ActionLog[] {
    const sql = 'SELECT * FROM action_logs ORDER BY seq DESC' + (opts?.limit ? ' LIMIT ?' : '')
    const params = opts?.limit ? [opts.limit] : []
    return this.db
      .prepare(sql)
      .all(...params)
      .map((row) => this.toActionLog(row as ActionLogRow)!)
  }

  nextSeq(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM action_logs')
      .get() as { seq: number }
    return row.seq + 1
  }

  insert(data: {
    action: HistoryActionType
    targetType: string
    targetId: number | null
    summary: string
    snapshot: Record<string, unknown> | null
  }): ActionLog {
    const result = this.db
      .prepare(
        `INSERT INTO action_logs (seq, action, targetType, targetId, summary, snapshot, status)
         VALUES (?, ?, ?, ?, ?, ?, 'applied')`
      )
      .run(
        this.nextSeq(),
        data.action,
        data.targetType,
        data.targetId,
        data.summary,
        data.snapshot === null ? null : JSON.stringify(data.snapshot)
      )
    return this.findById(result.lastInsertRowid as number)!
  }

  findById(id: number): ActionLog | null {
    return this.toActionLog(
      this.db.prepare('SELECT * FROM action_logs WHERE id = ?').get(id) as ActionLogRow | null
    )
  }

  private toActionLog(row: ActionLogRow | null): ActionLog | null {
    if (!row) return null
    let snapshot: Record<string, unknown> | null = null
    if (row.snapshot) {
      try {
        snapshot = JSON.parse(row.snapshot) as Record<string, unknown>
      } catch {
        snapshot = null
      }
    }
    return {
      id: row.id,
      seq: row.seq,
      action: row.action as HistoryActionType,
      targetType: row.targetType,
      targetId: row.targetId,
      summary: row.summary,
      snapshot,
      status: row.status as ActionLog['status'],
      createdAt: row.createdAt,
    }
  }
}