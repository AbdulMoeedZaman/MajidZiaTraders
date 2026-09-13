import type { AppDatabase } from '../sqlite'

// Action log: an append-only audit trail that also powers undo / redo.
//
//  - `seq`      : monotonically increasing ordinal. New actions always get the
//                 highest seq, so the newest applied action is the undo candidate
//                 and the oldest undone action is the redo candidate.
//  - `status`   : 'applied'   → the action represents the current state of the world.
//                 'undone'    → the action's effects were reversed; the lowest-seq
//                               undone row is the next redo candidate.
//                 'superseded'→ was undone, but a newer action has been applied since,
//                               so its redo trail is preserved for history but can
//                               never be re-applied.
//  - `snapshot` : JSON payload with the exact data needed to reverse (undo) or
//                 replay (redo) the recorded action.
//
//  Recorded actions (see HistoryService for the undo/redo semantics of each):
//    product_created   / restocked / payment_recorded / invoice_created
export function up(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seq INTEGER NOT NULL UNIQUE,
      action TEXT NOT NULL
        CHECK (action IN ('product_created', 'restocked', 'payment_recorded', 'invoice_created')),
      targetType TEXT NOT NULL,
      targetId INTEGER,
      summary TEXT NOT NULL,
      snapshot TEXT,
      status TEXT NOT NULL DEFAULT 'applied'
        CHECK (status IN ('applied', 'undone', 'superseded')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_action_logs_status ON action_logs(status, seq);
  `)
}