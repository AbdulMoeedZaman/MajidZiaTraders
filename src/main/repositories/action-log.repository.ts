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
  findAll(opts?: { limit?: number }): ActionLogRow[] {
    const sql = 'SELECT * FROM action_logs ORDER BY seq DESC' + (opts?.limit ? ' LIMIT ?' : '')
    const params = opts?.limit ? [opts.limit] : []
    return this.db.prepare(sql).all(...params) as ActionLogRow[]
  }

  /** The newest action still applied — the next undo candidate. */
  lastApplied(): ActionLogRow | null {
    return (
      (this.db
        .prepare("SELECT * FROM action_logs WHERE status = 'applied' ORDER BY seq DESC LIMIT 1")
        .get() as ActionLogRow | undefined) ?? null
    )
  }

  /** The oldest undone action — the next redo candidate. */
  nextRedo(): ActionLogRow | null {
    return (
      (this.db
        .prepare("SELECT * FROM action_logs WHERE status = 'undone' ORDER BY seq ASC LIMIT 1")
        .get() as ActionLogRow | undefined) ?? null
    )
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

  setStatus(id: number, status: string): void {
    this.db.prepare('UPDATE action_logs SET status = ? WHERE id = ?').run(status, id)
  }

  /** Records undo-time compensation data (e.g. the reversal movement id) on a row. */
  updateSnapshot(id: number, snapshot: Record<string, unknown> | null): void {
    this.db
      .prepare('UPDATE action_logs SET snapshot = ? WHERE id = ?')
      .run(snapshot === null ? null : JSON.stringify(snapshot), id)
  }

  /** A new action replaces the redo branch: previously undone actions are archived. */
  markSuperseded(): void {
    this.db.prepare("UPDATE action_logs SET status = 'superseded' WHERE status = 'undone'").run()
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