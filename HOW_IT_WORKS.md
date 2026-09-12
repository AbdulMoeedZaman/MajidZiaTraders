# MZTraders — How the project works

An engineering overview of the app **as it is today**: the process model, how a click in the
UI becomes a row in SQLite, the money rules, and the domain rules each service enforces.

> Other docs: [`USER_GUIDE.md`](./USER_GUIDE.md) is end-user facing. `SYSTEM_GUIDE.md` is an
> older engineering write-up and still describes taxes and CSV import/export that were
> removed; this file is the current reference.

---

## 1. What it is

A single-machine desktop app for a small trading business. It tracks products and stock,
creates numbered invoices and tracks customer account balances, records payments, and logs
supplier purchases ("restocks"). No server, no cloud, no account — the database is one local
SQLite file. There is **no tax handling** anywhere in the app.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Shell | Electron (main + preload + renderer processes), context-isolated |
| UI | React 19 + TypeScript, bundled with **electron-vite** |
| Database | SQLite via Node's built-in `node:sqlite` (`DatabaseSync`) |
| Wiring | Typed IPC channel names + a thin preload bridge |
| Tests | Vitest for unit suites; a raw Chrome DevTools Protocol script drives the real app for e2e |

The renderer has **no Node access and never touches SQLite**. Every read/write goes over IPC.

## 3. Architecture at a glance

```
┌──────────────────────── renderer ─────────────────────────┐
│  React features/  →  lib/api.ts (typed client facade)     │
│                          │ window.api.invoke(channel,…)   │
├──────────────────────── preload ──────────────────────────┤
│  src/preload/index.ts  exposes invoke() only              │
├──────────────────────── main ─────────────────────────────┤
│  src/main/ipc/*.ipc.ts     channel → service call         │
│  src/main/services/*       business rules + transactions  │
│  src/main/repositories/*   SQL only                       │
│  src/main/database/*       connection, migrations, backup │
│         └──► SQLite file (userData/inventory.db)          │
└────────────────────────────────────────────────────────────┘
src/shared/  types (DTOs), ipc-channels, date + money math  ← used by BOTH processes
```

Key rule: **business math lives once in `src/shared/calc/`** and is imported by both the
main process (authoritative, saved to the DB) and the renderer (live form preview). Because
they run the same functions, what the form previews is byte-for-byte what gets persisted.

## 4. Directory map

| Path | Purpose |
|---|---|
| `src/main/index.ts` | Bootstrap: open DB, mark overdue invoices, register IPC, create window |
| `src/main/database/` | `connection.ts` singleton + restore logic; `sqlite.ts` wrapper + transactions + online backup; `migrations/` versioned schema |
| `src/main/repositories/` | One class per domain; raw SQL, no business rules |
| `src/main/services/` | DTO validation, rules, multi-table transactions |
| `src/main/ipc/` | One `register*` per domain; thin, returns plain data |
| `src/preload/index.ts` | The `window.api` surface (only `invoke`) |
| `src/shared/types/` | DTOs shared by both processes |
| `src/shared/calc/` | `invoice-totals.ts`, `restock-totals.ts` (money math, tax free) |
| `src/shared/ipc-channels.ts` | Channel-name registry (the IPC contract) |
| `src/shared/date.ts` | ISO date validation + `localDate()` |
| `src/renderer/src/features/<domain>/` | UI: components, hooks, types per domain |
| `src/renderer/src/lib/api.ts` | Typed facade over `window.api.invoke` |
| `tests/unit/` | Vitest suites (isolated temp DB per test) |
| `tests/e2e/` | CDP-driven whole-app suites |

## 5. Boot sequence (`src/main/index.ts`)

1. `app.whenReady` → `getDatabase()` opens `userData/inventory.db`, sets
   `journal_mode = WAL` + `foreign_keys = ON`, runs pending migrations.
2. `new InvoiceRepository().markOverdue()` — recompute invoice statuses for today.
3. `registerAllIpc()` — register every `register*` from `src/main/ipc/index.ts`.
4. `createWindow()` — loads the React app (dev server in dev, `out/renderer` in prod).

A single-instance lock prevents two processes from ever opening the same DB file. Window
creation denies new windows and blocks navigation away from the app's own pages.

## 6. How an action flows (example: creating an invoice)

```
InvoiceForm.tsx  ──api.invoices.create(payload)──►  window.api.invoke('invoices:create', payload)
preload                                                      │
                                                             ▼
invoice.ipc.ts  ── InvoiceService.create(payload)           main
                     │ validates DTO
                     ▼
                 calculateInvoiceTotals(...)   (src/shared/calc)
                     │ items, totals, discount spread
                     ▼
                 invoice.repository.create()  runInTransaction
                     │ INSERT invoice + line items
                     │ deduct stock (sale movement)
                     │ write customer_ledger row
                     ▼
                 returns Invoice  ──► IPC result ──► form closes + list reloads
```

Failed rules surface as thrown `Error` strings that IPC carries back to the renderer and
displays inline. All money calculations are already done before the repository is called.

## 7. Persistence: migrations, backup, restore

- **Migrations** (`src/main/database/migrations/`): versions `001`–`006`, each in its own
  transaction, recorded in a `_migrations` table; `runMigrations` applies un-applied ones in
  order. Migration 006 is the pattern for table rebuilds (`PRAGMA defer_foreign_keys = ON`,
  copy / drop / rename, verify `PRAGMA foreign_key_check`).
- **Never edit an already-shipped migration.** Schema changes = a new numbered file +
  registry entry in `migrate.ts`.
- **Backup** uses SQLite's online `backup()` API while the live DB stays open (no downtime).
- **Restore** (`connection.ts:replaceDatabaseFromFile`) closes the DB, deletes stale
  `-wal`/`-shm` sidecars, copies the chosen file in, reopens + re-migrates; if that fails
  and a fallback copy exists, the previous DB is restored so data stays live.

## 8. The money model

- **All money is integer minor units** (paisa/cents). "Rs 900" is stored as `90000`.
  The renderer converts typed decimals via `moneyToCents` (×100) and displays cents divided
  by 100 via `formatMoney`. Counts (cartons, pieces) stay plain integers.
- Rounding is `Math.round` at each published step (per line, then totals) — never carried
  as floats.
- Rates that were basis-points (purchase tax) and percentages (sales tax) **no longer
  exist**; restock lines and invoices carry no tax fields or tax settings.

## 9. Domain and the rules the services enforce

### Products & stock (`inventory.*`, `stock-adjustments.*`)

- `products` holds catalogue data: name, SKU, unit, prices (base cost, min selling,
  selling), reorder level, category, MRP, pack info, active flag.
- **Stock is an audit trail, not a stored count.** Every change appends a row to
  `stock_movements` (type `opening_stock | restock | sale | adjustment | damage | return |
  other`, signed delta, previous/new balance, `referenceType`/`referenceId`, cost snapshot).
  The product's current quantity is simply the latest movement's `newQuantity`.
- 1 stock unit = 1 piece. Cartons are converted to pieces at boundaries
  (`qtyCartons × piecesPerCarton`); invoice lines are inherently pieces.
- Destructive actions are guarded: products with stock history can't be deleted; stock
  adjustments are reversed (marked, not removed); negative stock is refused.

### Invoices (`invoice.*`, `invoice-totals.ts`)

- Numbered `INV-000001`…; lines are `quantity × unitPrice` with **cost-at-time-of-sale**
  (`unitCost` snapshotted), so later supplier price changes never rewrite historical profit.
- `calculateInvoiceTotals` computes subtotal → whole-invoice discount (capped at subtotal,
  spread across lines in proportion to value with a rounding sweep, sums exactly) → total =
  subtotal − discount; profit = total − cost. Shared with the form preview.
- Min-selling-price floor and over-sell guard are enforced in the service (and mirrored in
  the form). Creating an invoice deducts stock atomically inside the same transaction.
- Status is derived (`computeInvoiceStatus`): paid / partial / sent / overdue (past dueDate)
  / cancelled; `markOverdue()` reruns at startup and after relevant mutations.

### Customers (`customer.*`, `customer-ledger.*`)

- A customer is **name + optional address only** (no phone, no NTN/tax fields). Name is
  unique; address is free text and may repeat.
- Every invoice (debit) and payment/credit (credit) writes a `customer_ledger` row; the
  running balance comes from the ledger. Customers with ledger/invoice/payment history
  cannot be deleted.

### Payments (`payment.*`)

- Payments are allocated to specific open invoices (`allocations`). A payment without an
  invoice is auto-applied to the oldest open invoices; leftover credit is carried to the
  next invoice. Overpaying an invoice is rejected. Deleting/reversing a payment repairs the
  affected invoices (paid/outstanding recomputed) and puts credit back on the customer.

### Restocks (purchases, `restock.*`, `restock-totals.ts`)

- A restock is a supplier purchase with business references kept on the header
  (`supplierInvoiceNo`, `dispatchNoteNo`, `salesOrderNo`) and an optional note.
- Items are **carton-shaped**: `qtyCartons`, `piecesPerCarton`, optional `mrpPerPiece`, and
  two money inputs — `netSalesValueExcl` (the authoritative trade value from the supplier's
  invoice) and `tradeDiscountValue`. Line payable
  `discountedValueInclusive = netSalesValueExcl − tradeDiscountValue` (never negative),
  computed by `computeRestockLineTotals`.
- Header totals (`totalNetValueExcl`, `totalTradeDiscount`, `totalCost`) are aggregated
  from the stored lines by `aggregateRestockLines` — header and lines can never disagree.
  `totalCost = totalNetValueExcl − totalTradeDiscount`.
- References are `RS-000001` monotonic; deleted numbers are never reused.
- **Mark received** posts a `restock` movement of `qtyCartons × piecesPerCarton` pieces per
  line, sets the product's landed cost via `restockLineUnitCost`
  (`round(payable / total pieces)` — sets `baseCostPrice` unless `updateCost: false`), and
  flips status to `received`. Received restocks can't be deleted/cancelled; only `pending`
  ones can be edited.
- `products:add-stock` (the "Add Stock" box on a product) is a convenience: it creates a
  single-line restock `{qtyCartons: quantity, piecesPerCarton: 1, netSalesValueExcl:
  unitCost × quantity}` and immediately receives it. Passing `costPerUnit` also updates the
  product's base cost; otherwise it uses the current `baseCostPrice`.

### Dashboard & reports (`dashboard.*`, `report.*`)

- The **Dashboard** is the app's single landing view: today's revenue/profit/sales stat
  cards, totals (customers, products, low/out-of-stock), low-stock and recent-invoice/payment
  lists, **and all report tabs folded into a "Reports" section** with a from/to date range.
- Reports: sales, profit & loss, inventory, customers, payments, restocks, stock movements.
  There is no separate Reports page in the sidebar. The `ReportsSection` component reuses the
  `useReports` hook + the report IPC/services backend.

### Settings & business profile (`business-profile.*`, `settings.*`, `backup.*`)

- Business profile: company identity (name, owner, phone, email, address, city, country,
  logo), invoice prefix + next number, footer, and currency (the currency drives
  `formatMoney` app-wide). No tax fields.
- Settings: a generic key/value table (used e.g. for the restock reference counter).
- Backup & restore live here (see §7). The CSV tool and purchase-tax defaults were removed.

## 10. Shared conventions to respect

- **DTOs shared**: change a type in `src/shared/types/` and both processes recompile against
  it; the renderer's `api.ts` and the main IPC channels are the two ends of the same contract.
- **Add an IPC call in four places:** channel name in `src/shared/ipc-channels.ts`, handler in
  `src/main/ipc/<domain>.ipc.ts`, `invoke` wrapper in `src/preload/index.ts`, typed method in
  `src/renderer/src/lib/api.ts`. (The preload whitelists channels automatically via the
  channel registry.)
- **Change money math** only in `src/shared/calc/*` — the form preview and persistence stay
  in sync automatically.
- **Don't return raw SQL rows across IPC**; services shape plain DTOs.

## 11. Tests

```bash
npm run typecheck      # tsc --noEmit across the whole project
npm test               # unit suites (tests/run-unit.mjs → Vitest)
npm run test:e2e       # build + launch the real app on a throwaway user-data dir,
                       #   drive it via CDP, assert persisted rows; app data untouched
npm run build          # electron-vite production build
npm run dev            # watch-mode dev with hot reload
npm run dist:win       # packaged Windows installer(s)
```

- Unit tests (`tests/unit/`) get an isolated temp user-data dir per test (`TEST_USER_DATA`),
  so each runs the full 001–006 migration chain on a clean DB.
- E2e (`tests/e2e/e2e.mjs`, `e2e-round2.mjs` via `run.mjs`) drives the *built* app through
  the real renderer → preload → IPC → SQLite path and aborts if the DB is not under the
  isolated user-data dir.

## 12. Common changes (cheat sheet)

- **Add a column/table**: new migration file + register in `migrate.ts`, update the
  repository SQL + shared type, surface in the feature's hook/form if needed, add/refresh a
  migration test. Never edit migrations 001–006.
- **Add an IPC call**: see §10 (four touches).
- **Change debt/balance or invoice math**: edit `invoice-totals.ts` / the invoice + payment
  services; run the invoice/payment unit suites and e2e.
- **Change restock math**: edit `restock-totals.ts`; the RestockForm preview and the
  repository aggregation both use it.
- **Verify a change end-to-end**: `npm run typecheck && npm test && npm run build &&
  npm run test:e2e`.