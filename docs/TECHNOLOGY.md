# Technology

Short summary of the technologies MZTraders is built with. For a deeper walk-through see [DEEP.md](./DEEP.md).

## The stack at a glance

| Layer | Technology |
| --- | --- |
| Runtime | Electron (Chromium + Node.js) |
| Renderer framework | React 18 + React DOM |
| Build tool | electron-vite (Vite for main / preload / renderer builds) |
| Language | TypeScript (strict), shared types compiled for both processes |
| Database | SQLite via Node's built-in `node:sqlite` module (Electron ships it) |
| Process bridging | Electron `ipcMain` / `contextBridge` + `ipcRenderer.invoke` |
| Testing | Vitest (unit, run under Electron's Node) + raw CDP e2e suites |
| Packaging | electron-builder, auto-update via `electron-updater` |

## Runtime: Electron

- App name: **MZTraders** (`app.setName('MZTraders')`).
- A single `BrowserWindow` (1280×800) with hardened defaults:
  - `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
  - Window open is denied, `will-navigate` is restricted to the app's own pages.
  - A `--remote-debugging-port 9337` switch is appended unless one is supplied (used by the e2e tests).
  - A single-instance lock: launching again focuses the existing window.
- Entry point: `src/main/index.ts`.

## Database: node:sqlite

- SQLite access uses Node's built-in `node:sqlite` (`DatabaseSync`), which is available inside Electron's Node.
- `src/main/database/sqlite.ts` wraps it in an `AppDatabase` class exposing `prepare/all/get/run/exec/close`, deliberately mirroring the old better-sqlite3 call-site shape so repositories only cast rows.
- `runInTransaction()` wraps a callback in `BEGIN IMMEDIATE … COMMIT` with `ROLLBACK` on error.
- `backupDatabase()` uses `node:sqlite`'s `backup()` API for WAL-safe backups.
- Database file: `majidzia.db` in the OS `userData` folder; WAL journal mode; foreign keys enabled. See [BACKEND.md](./BACKEND.md).

## Build & scripts

`package.json` scripts:

| Script | What it runs |
| --- | --- |
| `npm run dev` | electron-vite dev server with HMR for the renderer |
| `npm run build` | electron-vite production build (`out/`) |
| `npm start` | Launch a previously built app |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.json` over the whole project |
| `npm test` | `node tests/run-unit.mjs` (Vitest under Electron's Node) |
| `npm run test:e2e` | `node tests/e2e/run.mjs` (build + launch + CDP suites) |
| `npm run sample-data` | `tests/sample-data.mjs` regenerates `sample-data/mztraders-sample.db` |

- `electron.vite.config.ts` exposes a `@shared` alias to `src/shared` for both processes.
- `tsconfig.json` enables strict mode and maps `@shared/*` → `src/shared/*`.

## Shared code between processes

`src/shared/` holds code imported by both the main process and the renderer:

- `types/` — the entity models (Product, Customer, Invoice, StockMovement, …) and the DTOs.
- `ipc-channels.ts` — the single registry of every IPC channel name.
- `calc/invoice-totals.ts` — the money math (line amounts, rounding).
- `stock/stock-breakdown.ts` — the cartons + loose-pieces arithmetic.
- `date.ts` — local date helpers and ISO date validation.

Because both halves of the app import the same modules, the invoice total shown in the form preview can never disagree with the amount persisted by the service.

## Testing

- **Unit** (`tests/unit/*.test.ts`): driven by Vitest but spawned through Electron's Node (`ELECTRON_RUN_AS_NODE=1`) because `node:sqlite` is not available in a plain Node build. `tests/unit/electron-stub.ts` stubs Electron APIs; helpers open an in-memory or temp-file database and run the real migrations.
- **E2E** (`tests/e2e/e2e.mjs`, `e2e-round2.mjs`): launch the real built app in an isolated `user-data-dir` and drive it over the Chrome DevTools Protocol (port 9334), exercising the full renderer → preload → IPC → SQLite path.
- **Sample data** (`tests/sample-data.mjs`): seeds a demo database used to explore the app.

## Package layout

```
src/
  main/       Electron main process (window, DB, IPC, repositories, services)
  preload/    contextBridge whitelist bridge
  renderer/   React frontend (features, components, styles)
  shared/     modules imported by both processes (types, pure logic, IPC names)
tests/        unit tests, e2e suites, sample-data seeder
docs/         project documentation
```