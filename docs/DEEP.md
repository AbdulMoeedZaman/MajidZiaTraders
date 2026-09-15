# MZTraders — Deep Dive

The full walk-through of how this project works, end to end. This single file ties together the shorter guides: [TECHNOLOGY.md](./TECHNOLOGY.md), [STYLING.md](./STYLING.md), [BACKEND.md](./BACKEND.md), [FRONTEND.md](./FRONTEND.md) and [FEATURES.md](./FEATURES.md).

---

## 1. What the app is

MZTraders is a **desktop invoicing + inventory management app** for a parts-sales business. A trader delivers goods on **six fixed weekly routes** (Monday, Tuesday, Wednesday, Thursday, Saturday, Sunday — Friday has no route), each with a set of customers. Work done during the day:

1. **Bill customers** — create invoices for the route's customers (one invoice per customer per day).
2. **Print a load form** — a delivery sheet showing, per product, how many cartons + loose boxes go on the van, and per customer how much is being billed.
3. **Print invoices** — two per landscape A4 page, the first sharing page one with the load form.
4. **Restock / adjust** the shared stock ledger so the van can never be loaded more than what's in stock.
5. **Record payments** when customers pay, and watch profit, cash flow and owed balances on the dashboard.
6. **Record daily expenses.**

Everything is a strict, auditable ledger: stock, money, and actions.

---

## 2. High-level architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ RENDERER  (React 18 SPA, Electron renderer process)              │
│                                                                  │
│   App.tsx (view state)  ──  Feature pages (invoices, customers,  │
│          products, dashboard, expenses, settings, adjustments)   │
│                 │                                                │
│   lib/api.ts ── window.api.invoke(channel, …)                    │
└───────────────┬──────────────────────────────────────────────────┘
                │ contextBridge  (only whitelisted IPC_CHANNELS)
┌───────────────▼──────────────────────────────────────────────────┐
│ PRELOAD  (sandboxed, contextIsolation)                           │
└───────────────┬──────────────────────────────────────────────────┘
                │ ipcRenderer.invoke
┌───────────────▼──────────────────────────────────────────────────┐
│ MAIN PROCESS  (Node with node:sqlite)                            │
│                                                                  │
│  src/main/ipc/*         13 handler modules, thin                 │
│        │                                                        │
│  src/main/services/*    business rules + transactions            │
│        │                                                        │
│  src/main/repositories/*  SQL only                               │
│        │                                                        │
│  src/main/database/*      AppDatabase → node:sqlite → majidzia.db│
└──────────────────────────────────────────────────────────────────┘
        ▲
  src/shared  (types, IPC channel names, pure money/stock/date math)
```

The connection between layers is one-way and each layer stays dumb relative to the one above it:

- **IPC**: thin channel → service calls. No validation here.
- **Services**: the brain. Enforce business rules and wrap every multi-write in a transaction.
- **Repositories**: SQL and row casting only. Shared prefab `BaseRepository` supplies `db` and `runInTransaction`.
- **Shared code** (`src/shared`): imported by *both* halves so the renderer's form preview and the main process's persisted amounts use the exact same functions — they can't disagree.

---

## 3. Project layout

```
src/
  main/                     Electron main process
    database/               sqlite wrapper, connection, migrations/
    repositories/           one file per aggregate, SQL only
    services/               business rules per domain
    ipc/                    ipcMain.handle() registrars
    index.ts                window + app lifecycle
    updater.ts              electron-updater wiring
  preload/
    index.ts                contextBridge whitelist bridge
  renderer/
    index.html
    src/
      main.tsx              React bootstrap
      App.tsx               top-level view state + routing
      styles/globals.css    the only stylesheet
      components/           Layout (Sidebar/Header), SearchSelect,
                            StatusBadge, ErrorBoundary, RouteShortcuts
      features/             dashboard, invoices, customers, products,
                            expenses, settings, adjust, history
      lib/                  api, format, money, report, sheet-format,
                            load-form-print, bulk-print, selected-route
  shared/                   everything both processes import
    types/                  entity + DTO models
    ipc-channels.ts         the channel registry
    calc/                   invoice money math (pure)
    stock/                  cartons + pieces math (pure)
    date.ts                 local date + ISO validation
tests/
  unit/                     Vitest suites (run under Electron's Node)
  e2e/                      CDP-driven black-box suites
  run-unit.mjs              test runner wrapper
  sample-data.mjs           sample.db seeder
docs/                       these guides
electron.vite.config.ts, tsconfig.json, vitest.config.ts, package.json
```

---

## 4. Startup

1. `package.json` `"main": "./out/main/index.js"` → `src/main/index.ts`.
2. `app.setName('MZTraders')`; a `--remote-debugging-port 9337` switch is appended unless one was supplied (used only by e2e — normal users never see it).
3. A **single-instance lock** is taken; a second launch focuses the existing window instead of opening another.
4. On `app.whenReady()`:
   - `getDatabase()` opens the DB and runs migrations,
   - `registerAllIpc()` installs all `ipcMain.handle` registrations,
   - `createWindow()` builds the 1280×800 `BrowserWindow` with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, a preload, `window.open` denied, and a `will-navigate` same-origin guard,
   - `initAutoUpdater()` is launched (a no-op in dev).
5. The window loads `ELECTRON_RENDERER_URL` (dev/HMR) or `out/renderer/index.html` (built).
6. The renderer boots `main.tsx` → `App` under an `ErrorBoundary`.

The DB is closed on `before-quit`.

---

## 5. Database

File **`majidzia.db`** in the Electron `userData` directory. Two PRAGMAs on open: `journal_mode = WAL` and `foreign_keys = ON`. The wrapper:

- `src/main/database/sqlite.ts` exposes `AppDatabase` (`prepare`→`all/get/run`, `exec`, `close`) over `node:sqlite`'s `DatabaseSync`, plus:
  - `runInTransaction(db, fn)` → `BEGIN IMMEDIATE` … `COMMIT`, `ROLLBACK` on throw,
  - `backupDatabase()` using the SQLite online-backup API (WAL-safe),
  - `openReadonlyDatabase()` for validating backup files.
- `src/main/database/connection.ts` owns the singleton. `replaceDatabaseFromFile()` (used by restore) closes the live DB, deletes `-wal`/`-shm` sidecars, copies the new file in, reopens; on failure it can roll back to a safety copy.

### Schema (migrations 001–010)

**001 — initial schema**, core domain:

- `project_owners` (name, phone, address) — the store owner whose details print on invoices.
- `brokers` (name, phone) — bookers; every invoice references one.
- `routes` — seeded with exactly six fixed days (`Monday..Thursday, Saturday, Sunday`) with `position` ordering and `isActive`. Friday intentionally has no route.
- `products` (unique name, `rate` = minimum rate per carton in minor units, `boxesPerCarton`, later renamed `piecesPerCarton`).
- `customers` (unique `code`, shop name, owner name, phone, address, `routeId` FK, optional `ownerId`).
- `invoices` (unique `invoiceNumber`, customer/owner/broker FKs, `date` YYYY-MM-DD, `filerStatus`, computed `subtotal`, manual `remaining`/`tax`/`grandTotal`).
- `invoice_items` (product line with **snapshots**: product name, rate, min rate, pieces-per-carton, carton count, box count, computed `amount`).
- `settings` (generic key/value), seeded with `invoice_next_number = 1` and `invoice_description = ''`.

**002 — future extension points**: `payments` and `stock_movements` tables created up front so later features build on existing schema. `stock_movements` is the append-only ledger (`type`, signed `quantity`, `previousQuantity`/`newQuantity`, optional invoice reference).

**003 — route custom names**: routes get an immutable `day` seed and an editable `name` display label (backfills `day = name`).

**004 — display fields**: `stock_movements` gain a business `date` (backfilled from `createdAt`) and a `price` snapshot for sales.

**005 — expenses**: daily expenses, `UNIQUE(date, name)` so re-saving updates instead of duplicating.

**006 — invoice payments**: `invoices.status` (`unpaid|paid|partial|cancelled`, default `unpaid`) and `paidAmount` (default 0). Status is derived by the payment service and **stored**, so lists/dashboard/print never recompute it.

**007 — action log**: `action_logs` audit table — monotonic `seq`, action type, target, summary, JSON `snapshot`, and `status` (`applied|undone|superseded`, the last two retained only as historical audit data).

**008 — widen actions**: rebuilds `action_logs` (SQLite can't alter a CHECK) with the two additional correction actions, showing the table-rebuild migration pattern: `PRAGMA defer_foreign_keys = ON` → rename → recreate → copy → drop → `PRAGMA foreign_key_check` must be empty.

**009 — dual-unit stock**: renames `boxesPerCarton` → `piecesPerCarton` on products and invoice_items (`RENAME COLUMN`), and adds `newCartons`/`newLoosePieces` to `stock_movements` so every ledger row stores the running balance both as **total pieces** and as **whole cartons + loose pieces** (backfilled from `newQuantity`).

**010 — product sales price**: adds nullable `products.salesPrice` — the optional intended selling price per carton used to autofill invoice lines (falling back to the minimum rate when unset).

### Migration framework

- Version list is in `migrate.ts`; `LATEST_MIGRATION_VERSION` = 10.
- `PRAGMA user_version` is the **source of truth**; `_migrations` is an audit journal + fallback for legacy DBs. A migration counts as applied if the journal records it *or* its version ≤ user_version.
- Every migration runs in its **own transaction**, and the version stamp is written inside that same transaction — a crash mid-migration rolls back schema *and* stamp, so a DB is never left half-migrated.
- Golden rule: **never edit a shipped migration**; add a new one.

---

## 6. Data conventions

- **Money is integer minor units** (paisa / cents) everywhere. No floats in the DB. Renderer inputs parse decimals → minor units (`moneyToCents`), formatters render minor units → "Rs. 1,234.56".
- **Business dates** are `YYYY-MM-DD` strings, validated by `assertIsoDate` (rejects impossible dates like 2026-02-31). Timestamps are SQLite `datetime('now')` (UTC).
- **Stock** is measured in **pieces**; the *presentation* is always cartons + loose pieces derived via `piecesPerCarton`. A product with `piecesPerCarton = 12` and 30 stock = 2 cartons + 6 pieces.
- **Current stock** = the last ledger row's `newQuantity`/`newCartons`/`newLoosePieces`. There is no separate "on hand" column to drift out of sync.

### Shared pure math (the parts both sides agree on)

`src/shared/calc/invoice-totals.ts`:
- `roundToTen(amount)` — rounds to the nearest ten paisa (ones digit ≤ 5 → down).
- `calculateLineAmount()` — `rate × cartons + round(rate × boxes / piecesPerCarton)`, single integer rounding for the box part, then `roundToTen`. Used by the renderer's live form preview **and** by the persistence path.

`src/shared/stock/stock-breakdown.ts`:
- `canonicalComposition(pieces, pcp)` — splits pieces into whole cartons + leftover.
- `deductStock(current, needed, pcp)` — deduction uses loose pieces first, then breaks the minimum number of whole cartons; throws when `needed > available`. Negative `needed` handles returns/restocks.
- `addStock(current, quantity, pcp)` — the inbound twin.
- `assertSufficientStock(...)` — shared availability check with a friendly message.

`src/shared/date.ts` — `localDate()`, `isValidIsoDate()`, `assertIsoDate()`.

`src/shared/types/*` — every entity + `Create*/Update*` DTO the renderer and main exchange. Note `invoice.ts` exposes `invoiceDue()` (grand total, else subtotal) and `invoiceRemaining()` (due − paid, never negative).

---

## 7. Main process internals

### Repositories (`src/main/repositories`)

Each maps ~1:1 to a domain: `product`, `customer`, `invoice`, `stock`, `payment`, `expense`, `setting`(`settings`), `project-owner`, `broker`, `route`, `action-log`, `dashboard`.

Notable ones:

- **`invoice.repository`** — `findAllWithCustomer` (JOIN customers for name+code, filter by date range/customer, `ORDER BY date DESC, id DESC`), line-item reads, counters, a `create()` that inserts the invoice + every line row with pre-computed amounts (the invoice's stored subtotal is re-derived from the lines so storage == sum of persisted line amounts), payment-state updates, delete (items cascade), counts.
- **`stock.repository`** — a shared `MOVEMENT_SELECT` (JOINs product; LEFT JOINs invoice/customer so ledger rows show customer names), per-product last running balance (`lastNewQuantity`) and last composition (`lastComposition`), `currentLevels()` for all products via correlated subqueries, `insert` (with carton/loose columns), and invoice-scoped delete/sale lookups.
- **`dashboard.repository`** — aggregation SQL for profit lines, remaining per product, expenses, dispatches, payments and outstanding balances.
- **`base.repository`** — supplies `db` (the live `AppDatabase`) and `runInTransaction`.

### Services (`src/main/services`) — the business rules

**`invoice.service`** — the largest. `create()`:

1. Validate: ISO date, filer status, ≥ 1 line, customer exists, **owner exists** (error: "Set up the project owner…"), broker exists, optional tax is non-negative integer money.
2. `buildItems()` per line: product exists; rate = `defaultInvoiceRate(product)` = `salesPrice ?? minRate` when omitted, otherwise the submitted rate — submitted rates below the product's minimum are rejected; cartons/pieces validated; pieces = cartons × pcp + boxes; the line is canonicalised to whole cartons + leftovers; amount via shared math. (A legacy `quantity`-in-pieces input splits canonically too.)
3. `assertSufficientStock(items)` — across all lines, requested pieces must be ≤ current ledger balance per product.
4. Within one transaction: bump `invoice_next_number` setting → `generateInvoiceNumber` (`INV-000001`) → insert invoice + items → `stockService.recordSalesForInvoice` (one `sale` movement per line, negative quantity, price snapshot) → append history `invoice_created` with a full snapshot.

Also: `delete()` (refuses if any payments exist; removes the invoice's stock movements then the invoice, in the same transaction) and `cancel()` (in one transaction: delete the invoice's payments, `revertSalesForInvoice` writes a `return` movement per original sale restoring the balance exactly, mark status `cancelled` — the invoice stays for history and **never** counts as profit/sales again).

`buildLoadReport(invoiceIds)` aggregates a set of invoices for the load form: per-product combined quantity (canonicalised cartons+boxes), per-customer summed grand totals, invoice numbers, overall grand total; rejects cancelled invoices.

**`stock.service`** — restock (`purchase` movement, cartons+loose → pieces), manual `adjust` (exact cartons+loose, `adjustment` movement, over-removal blocked, free-text note), plus `recordSalesForInvoice`, `removeForInvoice`, `revertSalesForInvoice` used by invoice create/delete/cancel. All writes append history entries (in the same transaction).

**`payment.service`** — `payInvoice` parks the payment on one invoice; `payCustomer` applies an amount across the customer's **open invoices oldest-first**, rolling surplus to the next and rejecting amounts above the total outstanding; `removePayment` deletes a mistaken payment and **recomputes** the invoice's paid amount + status from what remains. Status derivation: `paid` when paid ≥ due, `partial` when anything recorded, else `unpaid`.

**`dashboard.service`** — one `summary(start, end)` call powers the whole dashboard:
- profit per customer = `Σ (line.amount − costBasis)` where costBasis is the line valued at its **minimum rate** (the trader's "actual" price), so profit = what was billed above the floor;
- stock remaining per product valued at its rate;
- invoices in range (cancelled excluded from sales); today's dispatches;
- expenses today + grouped by day for the range;
- amounts still owed (all open invoices, not date-bounded);
- cash flow: payments in vs expenses in;
- recent products/invoices/customers.

**`expense.service`** — save/delete/day-summary/range-summary; `(date, name)` unique upsert semantics.

**`backup.service`** — create (online `backupDatabase`, refuses the live path and existing files), validate (readonly open → `PRAGMA integrity_check` = ok, `_migrations` records exist, version ≤ app's) and restore (safety copy of the current DB to `userData/backups` first, then `replaceDatabaseFromFile`, auto-rolling back to the safety copy if the restore can't open).

**`history.service`** — appends audit rows; called *inside* each domain service's own transaction (it never opens one itself).

**`customer.service` / `product.service`** — CRUD plus imports: customers from an **Excel (.xlsx)** store listing assigned to a route, products from a **CSV** file — each skipping duplicate/invalid rows and returning counts. Deleting an invoice/customer is guarded by referential counts.

**`settings.service` / `broker` / `project-owner` / `route`** — small CRUD; route rename keeps `day` immutable.

### IPC wiring

- `src/shared/ipc-channels.ts` is the **single registry** of every channel string.
- `src/main/ipc/index.ts` registers 13 modules: project-owner, broker, route, product, stock, customer, invoice, settings, backup, dashboard, expense, payment, history.
- Preload (`src/preload/index.ts`) exposes exactly `window.api.invoke(sourceChannel, …args)` through `contextBridge`; it **rejects any channel not in `IPC_CHANNELS`**. `sandbox + contextIsolation + no nodeIntegration` keep the renderer surface minimal.
- File pickers for imports/backup use `dialog.showOpenDialog` on the hosting window and return `{ canceled, path }`.

---

## 8. Renderer internals

### View model

`App.tsx` keeps a tiny state machine: `view` ∈ {dashboard, invoices, expenses, customers, products, settings, multiple-invoices} plus three detail ids and two flags. `navigate()` resets everything; `headers` maps states to back links. `Layout` = `Sidebar` (NAV_ITEMS from `nav.ts`) + `Header` (title or `VIEW_TITLES`).

### How features read/write data

Every feature calls `api.*` from `src/renderer/src/lib/api.ts`, which wraps `window.api.invoke`. Typed groups mirror the backend channels 1:1 (products, customers, invoices, stock, payments, expenses, settings, history, backup, dashboard, dialogs). If `window.api` is missing (someone opened the page in a plain browser) `ipc()` rejects with guidance to use `npm run dev`.

### The invoice flow (build)

`InvoiceForm` lets the user:
- pick customer (SearchSelect), broker, date, filer status;
- add lines: pick a product, the rate **autofills from Sales Price / min rate**, enter cartons + loose pieces;
- see the running total via the shared `calculateLineAmount` preview.

On submit the DTO crosses IPC; `invoice.service.create` re-validates everything and the invoice is returned with its real number/status. After creation the user lands on the invoice detail to print.

### Multiple invoices (route batch)

`MultipleInvoicesPage` / `MultiInvoiceForm` create invoices for a batch of customers (typically the route's list) with one shared broker.

### Printing

- `InvoiceSheet` renders the on-screen sheet exactly as it prints (`@media print`/`@page` rules hide everything else).
- A load-form bulk print renders a **hidden** `.bulk-print` DOM tree; the shortcut/print path sets `body.bulk-printing`, the CSS swaps the whole print job to it: load form + first invoice on page one, the rest two-per-page on landscape A4. The pagination math is pure data in `lib/load-form-print.ts` (`planInvoicePages`, `groupIntoTwoUp`, `planBulkPrint`) and shared with unit tests.
- Dashboard modal reports use `lib/report.ts`: `printReport` opens a standalone print-ready window; `exportReportCsv` downloads a UTF-8-BOM CSV.

### Shortcuts (Alt+Q / Alt+W)

`RouteShortcuts` is mounted by `App` (disabled while a batch is open). One global `keydown` listener with guards: ignore `e.repeat`, require `Alt`, skip when focus is in input/textarea/contenteditable, never open over an existing `.overlay`/`.modal-page`, never start while a print is preparing.

- **Alt+Q** → `runInvoices()`: read persisted route (localStorage `mztraders:selected-route`, maintained by `useCustomers`); load the route's customers; fetch today's invoices and **skip customers already invoiced today (non-cancelled)**; show a confirmation modal with a booker search (pre-selected when only one broker); picking the broker opens `MultipleInvoicesPage` for the pending customers.
- **Alt+W** → `runPrint()`: same route/today logic, collects today's invoice ids for the route, confirms, then `buildLoadForm` → `prepareBulkPrintData` → `flushSync` the `.bulk-print` tree → `window.print()` → clean up.

### Search, status, errors

- `SearchSelect` replaces `<select>`: filter-as-you-type, ↑/↓/Enter/Esc, rendered via portal so it opens above modals, flips upward when tight on space, imperative `open()`/`close()` handle for keyboard-driven flows (shortcut booker).
- `StatusBadge` colours invoice statuses; `ErrorBoundary` shields each view and offers a reload.

---

## 9. End-to-end journeys

### Create today's invoices for the route (daily rhythm)

1. `Customers` screen → pick a route tab (persists to localStorage).
2. `Alt+Q` → shortcut checks route + today's existing invoices → confirm, choose booker → `MultipleInvoicesPage` creates each pending customer's invoice.
3. Each invoice create runs through `invoice.service`: validate → build items (autofill rate) → stock check → transaction (counter, invoice+items, sale movements, audit log).
4. `Alt+W` → build load form for today's invoices → print (load form + first invoice, then 2-up invoices).
5. Balances: dashboard shows tonight's profit, stock remaining, and cash received.

### An invoice, step by step

```
InvoiceForm submit
  → api.invoices.create(dto)                         [renderer]
  → invoice.ipc 'invoices:create'                     [main]
  → InvoiceService.create
      validate date/filer/owner/broker/lines
      buildItems → rate=default(rate), floor(rate>=min), canonicalise
      assertSufficientStock
      runInTransaction(
        settings.nextCounter('invoice_next_number') → INV-00000N
        invoiceRepo.create(invoice + items, subtotal=Σlines, tax=roundToTen, grandTotal=subtotal+tax)
        stockService.recordSalesForInvoice  (1 'sale' row per line, price snapshot)
        history.append 'invoice_created'  (invoice + items + movements snapshot)
      )
  → InvoiceWithItems returned → detail page → print sheet
```

### Stock lifecycle

- **Restock**: `stock:restock` → `purchase` movement (cartons+loose → pieces), adds to the running balance, audit `restocked`.
- **Sale**: embedded in invoice create (deducts via `deductStock`, loose-first).
- **Adjust**: `stock:adjust` → exact cartons/loose add or remove with a note; removing more than in stock is blocked; audit `stock_adjusted`.
- **Cancel invoice**: `return` movements per original sale restore the balance exactly; audit stays coherent.
- **Current stock** is always the last ledger row — no secondary tally to fight with.

### Payment → status

`payCustomer` wants Rs. 5,000 from a customer with three open invoices (Rs. 2,500 / 1,500 / 2,000): it writes 2,500 → invoice A (paid), 1,500 → B (paid), 1,000 → C (partial), one `payments` row + `updatePaymentState` per invoice, one audit entry with all entries in the snapshot. A subsequent `payInvoice`/`payCustomer` behaves the same. `removePayment` recomputes affected invoice state.

### Backup & restore

Settings → Backup: choose save path → `backup:create` (online backup of the live DB). Restore validates the file first (integrity + migration journal + version ≤ current), snapshots the live DB to `userData/backups/before-restore-*.db`, then swaps it in; `replaceDatabaseFromFile` rolls back automatically if the new file won't open.

### Imports

Products: pick a CSV (`dialog:open-csv`) → `products:import-csv` parses rows, skipping duplicate names/invalid rows, reports `{created, skippedDuplicate, skippedInvalid}`. Customers: pick an Excel listing + target route → `customers:import-excel` same style.

---

## 10. Testing

- **Unit (`tests/unit`, 15 suites)**: Vitest spawned through *Electron's* Node (`ELECTRON_RUN_AS_NODE=1`) because `node:sqlite` ships inside Electron; `electron-stub.ts` stubs Electron APIs. `helpers.ts` builds a temp DB and runs the real migrations. Covered: invoice service & totals, stock, payments, expenses, dashboard, backup, imports, migrations, history, load-form-print, report, sample data.
- **E2E (`tests/e2e`)**: builds the app, launches it in an isolated user-data dir with `--remote-debugging-port 9334`, and drives it over the **Chrome DevTools Protocol** — the real renderer → preload → IPC → SQLite path, including file-picker flows, with runtime exception capture and an assertion DSL.
- **Runner scripts**: `npm test` → `tests/run-unit.mjs`; `npm run test:e2e` → `tests/e2e/run.mjs`; `npm run sample-data` regenerates the demo DB.

---

## 11. Build, packaging, updates

- electron-vite builds three targets (`out/main`, `out/preload`, `out/renderer`); `@shared` is aliased everywhere.
- `npm run typecheck` runs strict `tsc --noEmit` over the whole project — a required guard before adding code.
- `electron-updater` is wired for an NSIS Windows installer: **autoDownload = false**, prompts before download-install; checks for updates 5 s after launch **only in packaged builds** (dev never phones home). Requires `build.publish` in package.json pointed at the update server.

---

## 12. Invariants worth preserving

1. **Never ship `float` money.** Parse to minor units on input; format on output; all shared math in minor units.
2. **Never edit a shipped migration**; version-checks go in a new one with its own transaction + journal stamp.
3. **Stock balances come from the ledger**, never a stored "on hand" number.
4. **Snapshot line data on invoices** (name, rate, min rate, pcp) so later product edits never rewrite history.
5. **Rate floors are enforced server-side**, even though the UI already autofills and hints.
6. **Cancel = keep + reverse** (restore stock + payments, mark `cancelled`) — history stays true; cancellations never count as sales/profit.
7. **Audit log entries and their data changes share one transaction.**
8. **The dashboard's profit basis is the minimum rate** — the app deliberately prices at a floor and reports the lift.
9. **IPC surface is whitelist-only** (`IPC_CHANNELS`) behind `contextIsolation`/`sandbox`.
10. **Every multi-row write goes through `runInTransaction`** — partial writes are a bug.