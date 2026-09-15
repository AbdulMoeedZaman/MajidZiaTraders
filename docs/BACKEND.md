# Backend

Short summary of the main-process / data layer of MZTraders. Architecture, database, migrations, repositories, services and IPC. See [DEEP.md](./DEEP.md) for the full walk-through.

## Layered design

The main process is a clean three-tier architecture:

```
IPC handlers (src/main/ipc)   — channel boundary, thin
Services      (src/main/services) — business rules + transactions
Repositories  (src/main/repositories) — SQL, no business logic
SQLite        (src/main/database) — connection + migrations
```

Handlers in `src/main/ipc/*.ipc.ts` validate nothing; they map a channel to a `Service` call. Services enforce every rule and coordinate repositories inside transactions. Repositories only build queries and cast rows.

All of it runs with **strict TypeScript** and shared DTO types from `src/shared/types`.

## Database access

- File: **`majidzia.db`** in the Electron `userData` folder (`src/main/database/connection.ts`). The DB_FILENAME is deliberately different from the old `inventory.db` so a legacy database is never touched.
- On open: `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`, then migrations run.
- `src/main/database/sqlite.ts` wraps `node:sqlite`'s `DatabaseSync` in an `AppDatabase` (`prepare/all/get/run/exec/close`) plus `runInTransaction(fn)` = `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`.
- `backupDatabase()` uses `node:sqlite`'s `backup()` (WAL-safe).
- Restore: `replaceDatabaseFromFile()` closes the live DB, removes `-wal`/`-shm` sidecars, copies the backup in and re-opens — with an automatic fallback copy so a bad restore never kills the live data.
- The app is single-instance, and the DB is closed on `before-quit`.

## Migrations

`src/main/database/migrations/migrate.ts` holds an ordered list of migrations 001→010 (currently `LATEST_MIGRATION_VERSION = 10`).

Rules:
- One transaction per migration; the `PRAGMA user_version` stamp is written inside that same transaction, so a failed migration rolls back both the schema and the version.
- `_migrations` table is an audit journal (who/what/when) and a fallback for databases created before version tracking.
- Migration 008 shows the table-rebuild pattern: `PRAGMA defer_foreign_keys = ON`, rename old table, create new, copy rows, drop old, then verify `PRAGMA foreign_key_check` is empty.

Migration history in one line:

| # | File | What it adds |
| --- | --- | --- |
| 001 | `001_initial_schema.ts` | project_owners, brokers, routes (six fixed days: Mon–Thu, Sat, Sun), products, customers, invoices, invoice_items, settings |
| 002 | `002_future_extension_points.ts` | payments and stock_movements tables (built early) |
| 003 | `003_route_custom_names.ts` | routes gain an immutable `day` seed + editable `name` |
| 004 | `004_stock_movement_display_fields.ts` | business `date` + `price` snapshot on stock_movements |
| 005 | `005_expenses.ts` | daily expenses (unique `(date, name)`) |
| 006 | `006_invoice_payments.ts` | invoices gain `status` and `paidAmount` |
| 007 | `007_action_logs.ts` | append-only audit log (`action_logs`) |
| 008 | `008_action_logger_actions.ts` | widens the action log CHECK with payment_reversed / stock_adjusted |
| 009 | `009_dual_unit_stock.ts` | renames `boxesPerCarton`→`piecesPerCarton`, adds `newCartons`/`newLoosePieces` running composition |
| 010 | `010_product_sales_price.ts` | products gain optional `salesPrice` (drives invoice-line autofill) |

## Repositories

One per aggregate in `src/main/repositories/`, all extending `BaseRepository` (gives `db` + `runInTransaction`):

`project-owner`, `broker`, `route`, `product`, `customer`, `invoice` (+ `InvoiceItemRow` shape), `stock` (ledger queries incl. per-product running balances), `expense`, `payment`, `settings`, `action-log`, `dashboard` (aggregation queries).

Repositories only send SQL; correctness lives in the services above them.

## Services (business rules)

- **invoice.service** — creation pipeline: validates date/filer/owner/broker, `buildItems()` autofills the rate (`defaultInvoiceRate = salesPrice ?? minRate`), enforces the min-rate floor, canonicalises cartons+loose pieces, computes amounts via shared `calculateLineAmount`, checks stock sufficiency, then in one transaction: bumps the `invoice_next_number` counter (settings), inserts invoice + items, writes `sale` stock movements, and appends a history entry. Also load-form aggregation and delete/cancel (cancel → reverse payments + `return` stock movements + status `cancelled`).
- **stock.service** — restock (`purchase`), manual `adjustment` (with over-removal guard), `sale`/`return` ledger writes on behalf of invoices; balances always derived from the last ledger row.
- **payment.service** — single-invoice payment; customer-wide payment that settles open invoices **oldest first**; payment reversal with state recomputation; status is always derived (`paid`/`partial`/`unpaid`).
- **dashboard.service** — profit per customer (= billed − minimum-rate cost basis), stock remaining + value, invoice totals, today's dispatches, expenses (today + range), amounts still owed, cash-flow summary, recent lists.
- **expense.service** — daily expenses; `(date, name)` upsert semantics.
- **customer.service / product.service** — CRUD plus imports: customers from an **Excel** listing (assigned to a route), products from a **CSV** file, with duplicate/invalid skipping and a result summary.
- **settings.service** — generic string settings (e.g. `invoice_next_number`, invoice description).
- **history.service** — appends to the audit log (always inside the caller's transaction).
- **backup.service** — create/validate/restore backup files.
- **broker / project-owner / route** — small CRUD; the project owner also holds the store name/address used on printed sheets.

## IPC

- Channel names are centralised in `src/shared/ipc-channels.ts` (`IPC_CHANNELS`) and used by all three sides (preload whitelist, handlers, renderer `api`).
- `src/main/ipc/index.ts` registers 13 handler modules: project-owner, broker, route, product, stock, customer, invoice, settings, backup, dashboard, expense, payment, history.
- The preload `contextBridge` exposes only `window.api.invoke`, which rejects any channel not in `IPC_CHANNELS` (`src/preload/index.ts`).
- Import flows (Excel for customers, CSV for products, backup save/open) use `dialog.showOpenDialog` / `showSaveDialog` on the hosting window and return a `DialogResult`; the renderer reaches them through `api.dialogs`.

## Conventions

- Money is stored as **integer minor units** (whole paisa / cents) everywhere — no floats.
- All money and quantity math that both sides must agree on lives in `src/shared` (`calc/invoice-totals.ts`, `stock/stock-breakdown.ts`, `date.ts`), so the renderer preview and the persisted row can never disagree.
- Business dates are `YYYY-MM-DD` strings validated with `assertIsoDate`; timestamps are UTC `datetime('now')`.
- Errors thrown by services carry user-friendly messages shown by the renderer's error/notification UI.