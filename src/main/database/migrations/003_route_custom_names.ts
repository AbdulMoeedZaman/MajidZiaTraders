import type { AppDatabase } from '../sqlite'

// Routes gain an immutable day-of-week label. `name` becomes the editable
// display name (users can give each day's route a custom name), while `day`
// stays the fixed seed value that identifies the route. Backfills day = name
// for any pre-existing rows.
export function up(db: AppDatabase): void {
  db.exec(`
    ALTER TABLE routes ADD COLUMN day TEXT NOT NULL DEFAULT '';
    UPDATE routes SET day = name WHERE day = '';
  `)
}