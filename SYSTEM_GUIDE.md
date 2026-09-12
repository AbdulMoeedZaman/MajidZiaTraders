# MZTraders — System Guide

Technical documentation for developers: how the app is put together, how data flows
through it, and the rules the code enforces. For end-user instructions see
[`USER_GUIDE.md`](./USER_GUIDE.md); the business requirements behind the purchase side
are in [`PRODUCT_STRUCTURE_PLAN.md`](./PRODUCT_STRUCTURE_PLAN.md).

---

## Contents

1. [What the system is](#1-what-the-system-is)
2. [Tech stack](#2-tech-stack)
3. [Architecture: three processes, one shared layer](#3-architecture-three-processes-one-shared-layer)
4. [Directory map](#4-directory-map)
5. [Boot sequence and data ownership](#5-boot-sequence-and-data-ownership)
6. [Persistence: SQLite, migrations, backup and restore](#6-persistence-sqlite-migrations-backup-and-restore)
7. [The money model](#7-the-money-model)
8. [Core domain and invariants](#8-core-domain-and-invariants)
9. [The purchase side (restocks)](#9-the-purchase-side-restocks)
10. [The sales side (invoices, customers, payments)](#10-the-sales-side-invoices-customers-payments)
11. [Stock movements — the audit trail](#11-stock-movements--the-audit-trail)
12. [Settings and the business profile](#12-settings-and-the-business-profile)
13. [CSV import and export](#13-csv-import-and-export)
14. [Tests and how to run them](#14-tests-and-how-to-run-them)
15. [Common changes cookbook](#15-common-changes-cookbook)

---

## 1. What the system is

**MZTraders** is an offline desktop app for small wholesale/trading businesses. It
does four connected jobs in one place:

- **Stock control** — a product catalogue plus a total-audit-trail stock system. Every
  piece gained or lost is a recorded movement.
- **Selling** — numbered invoices with cost-at-time-of-sale, automatic profit, min-price
  floor, and an anti-over-sell guard.
- **Customer accounts** — a ledger per customer (invoices add, payments subtract) with a
  running balance and automatic overdue marking.
- **Buying (restocks)** — records supplier purchases in the same carton/tax shape as the
  supplier's real sales-tax invoice, and converts received goods into per-piece stock.

It runs entirely on one machine. No server, no internet, no account.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron (main + preload + renderer processes) |
| Renderer | React 19 + TypeScript, bundled with **electron-vite** |
| Database | SQLite via Node's built-in `node:sqlite` (`DatabaseSync`) |
| Wiring | Context-isolated preload + typed IPC channels |
| Tests | Vitest (unit, `tests/unit/*`) + raw Chrome DevTools Protocol script against the real app (`tests/e2e/*`) |

The renderer never talks to SQLite directly and has no Node access. All data access goes
through IPC to the main process.

---

## 3. Architecture: three processes, one shared layer

```
┌──────────────────────────── renderer ────────────────────────────┐
│  React UI (features/)  ->  lib/api.ts (typed client facade)      │
│                 |                                                 │
│                 v  window.api.*  (preload, context-isolated)      │
├──────────────────────────── preload ─────────────────────────────┤
│  src/preload/index.ts  exposes ipcRenderer.invoke wrappers only   │
├──────────────────────────── main ────────────────────────────────┤
│  src/main/ipc/*.ipc.ts     thin channel -> service                │
│  src/main/services/*       business rules, transactions           │
│  src/main/repositories/*   SQL                                    │
│  src/main/database/*       connection + migrations                │
│        |                                                          │
│        v SQLite (userData/inventory.db)                           │
└───────────────────────────────────────────────────────────────────┘
src/shared/  types, channels, date helpers, and math used by BOTH processes
```

**The rule:** business rules and money math live once in `src/shared/calc/` and are
imported by both the main process (authoritative calculation and storage) and the
renderer (instant form previews). Because both sides call the same functions, the preview
can never disagree with what gets saved.

Security posture (`src/main/index.ts`): `sandbox: true`,
`contextIsolation: true`, `nodeIntegration: false`, window-open denied, and navigation
blocked to non-app URLs.

---

## 4. Directory map

| Path | Holds |
|---|---|
| `src/main/index.ts` | App bootstrap: DB open + migrate, overdue sweep, IPC registration, window |
| `src/main/database/connection.ts` | Singleton connection, WAL, restore/replace logic |
| `src/main/database/sqlite.ts` | `AppDatabase` wrapper + `runInTransaction` + online backup |
| `src/main/database/migrations/` | Versioned schema migrations (`001`–`006`) |
| `src/main/repositories/` | One class per domain; raw SQL only |
| `src/main/services/` | Business rules, DTO validation, multi-table transactions |
| `src/main/ipc/` | One `register*` per domain; calls the service, returns plain data |
| `src/preload/index.ts` | The safe `window.api` surface |
| `src/shared/types/` | DTOs shared by main and renderer |
| `src/shared/calc/` | Money math: `invoice-totals.ts`, `restock-totals.ts` |
| `src/shared/ipc-channels.ts` | The channel name registry (the IPC contract) |
| `src/renderer/src/features/<domain>/` | UI per domain (components, hooks, types) |
| `tests/unit/` | Vitest suites, incl. migration tests |
| `tests/e2e/` | CDP-driven whole-app suites |

---

## 5. Boot sequence and data ownership

`src/main/index.ts`, on `app.whenReady`:

1. `getDatabase()` — opens `userData/inventory.db`, sets WAL + foreign keys, runs pending
   migrations.
2. `new InvoiceRepository().markOverdue()` — recomputes statuses against today's date.
3. `registerAllIpc()` — registers every IPC handler.
4. `createWindow()` — loads the React app (dev server in dev, built `index.html` in prod).

A single-instance lock makes the second launch just focus the existing window, so two
processes can never open the same SQLite file.

---

## 6. Persistence: SQLite, migrations, backup and restore

The database is a single file, `inventory.db`, in Electron's `userData` directory.
`journal_mode = WAL` and `foreign_keys = ON` at open.

### Migrations

- Registry + runner: `src/main/database/migrations/migrate.ts`; applied versions are
  recorded in a `_migrations` table. Un-applied versions run in order, each inside its
  own transaction.
- **Never edit a migration that may already have run** on a user's machine. Add a new
  numbered migration and register it in `migrate.ts`.
- Table rebuilds must respect SQLite constraints: `PRAGMA foreign_keys` cannot be
  toggled inside a transaction, so migration 006 uses `PRAGMA defer_foreign_keys = ON`,
  re-creates the table under a temp name, copies rows, drops the original, renames, and
  verifies `PRAGMA foreign_key_check` is empty. Pattern reference:
  `006_product_purchase_structure.ts`.

### Backup / restore

- Backup uses SQLite's online backup API (`node:sqlite` `backup()`) while the live DB
  stays open — no lock/downtime.
- Restore replaces the live DB from a chosen file, **removes any `-wal`/`-shm` sidecars**
  (a stale sidecar would corrupt a fresh copy), reopens, and re-runs migrations. If open
  or migrate fails and a fallback was provided, the previous file is copied back so data
  stays live (`connection.ts:replaceDatabaseFromFile`).

---

## 7. The money model

- **All money amounts are integer minor units (paisa/cents).** A "Rs 900" value is stored
  as `90000`. Renderer money inputs are typed in decimal and converted with
  `parseDollars` (`×100`); display divides by 100 (`formatMoney`). Never mix units: a
  count like cartons uses `parseCount` (plain integer), and a rate uses `parseBps` (basis
  points) — applying `parseDollars` to a count or a rate is a classic bug.
- **Tax rates have two representations — know which one you're reading:**
  - **Sale (invoice) side:** percentage (e.g. `10` = 10%), stored on `business_profile`
    and per invoice.
  - **Purchase (restock) side:** basis points (e.g. `1800` = 18.00%, `10` = 0.10%),
    stored in settings (`purchaseSalesTaxRateBps`, `purchaseAdvanceTaxRateBps`) and
    snapshotted per restock line.
- Rounding is `Math.round` at each published step (per budget line, then totals), never
  carried as floats.

---

## 8. Core domain and invariants

### Product

`products` carries the selling side (name, SKU, unit, minSalePrice, salePrice,
reorderLevel, category, image) **plus** the purchase structure added by migration 006:

| Column | Meaning |
|---|---|
| `packSize`, `packConfig` | Free-text human description of a pack, e.g. "12 × 200g" |
| `mrp` | Retail price printed per piece, minor units; enforced non-negative integer on create and update |
| `purchaseUnit` | How stock arrives from suppliers; default `'carton'` |
| `baseCostPrice` | **Inclusive** per-piece landed cost, overwritten on each restock receipt |

### Restock (purchase / supplier invoice)

- Header (`restocks`): supplier name, date, status (`pending | received | cancelled`),
  the supplier's own tax references (`supplierInvoiceNo`, `supplierRegistrationNo`,
  `buyerNtn`, `buyerCnic`, `dispatchNoteNo`, `salesOrderNo`) and five aggregated totals:
  `totalRetailValueExcl`, `totalSalesTax`, `totalAdvanceTax`, `totalTradeDiscount`,
  `totalNetValueExcl`, and `totalCost` (grand payable: net + sales tax + advance tax −
  discount).
- Items (`restock_items`): **carton-shaped** — `qtyCartons`, `piecesPerCarton`,
  `mrpPerPiece`, per-line `salesTaxRate`/`advanceTaxRate` (bps), and the computed chain
  `retailPricePerCarton` → `totalRetailValueExcl` → `salesTaxAmount` → `advanceTax` →
  `netSalesValueExcl` (the supplier's authoritative trade value) → `tradeDiscountValue`
  → `discountedValueInclusive` (line payable).
- The old `unit`, `quantity`, `unitCost`, `totalCost` item columns were dropped in 006.
  Legacy rows were backfilled as `qtyCartons = quantity`, `piecesPerCarton = 1`,
  `netSalesValueExcl = totalCost`, `discountedValueInclusive = totalCost`.

### Invoice (sale)

- Numbered invoices (`INV-000001`…), per-line quantity × unit price with
  cost-at-time-of-sale, a whole-invoice discount spread over lines in proportion to
  value, tax, and statuses `sent | paid | partial | overdue | cancelled`.

### Stock movements

One append-only table, `products` (current quantity) is the **derived** latest-of the
movement chain. See [§11](#11-stock-movements--the-audit-trail).

### Customers / ledger / payments

`customers` with a `customer_ledger` (one row per invoice/payment, running balance) and,
since migration 005, a fully reconciled payment-allocation model: every payment is
carried to specific invoices as `allocations`, and the ledger is derived/synchronised
from those allocations. Payments may be reversed; allocations and the ledger are repaired
by the reconciliation routine.

---

## 9. The purchase side (restocks)

### Creating a restock (`RestockService.create` / `update`)

1. Validate supplier name, date, at least one line, each line has a real product and
   `qtyCartons ≥ 1`, `piecesPerCarton ≥ 1`, `netSalesValueExcl ≥ 0`.
2. For each line, resolve the tax rates: use the line-level bps if given, otherwise the
   **business-wide purchase defaults** from settings.
3. Calculate every money field with `computeRestockLineTotals` in
   `src/shared/calc/restock-totals.ts` (unless the DTO explicitly overrides
   `retailPricePerCarton` / `salesTaxAmount` / `advanceTax` to make the line match the
   physical supplier invoice exactly):

   ```
   retailPricePerCarton = round( piecesPerCarton × mrpPerPiece × 10000 / (10000 + salesTaxRateBps) )
   totalRetailValueExcl = qtyCartons × retailPricePerCarton
   salesTaxAmount       = round( totalRetailValueExcl × salesTaxRateBps / 10000 )   // on line total
   advanceTax           = round( netSalesValueExcl × advanceTaxRateBps / 10000 )    // on net/excl trade value
   discountedValueInclusive = netSalesValueExcl + salesTaxAmount + advanceTax − tradeDiscountValue
   ```

   Note `netSalesValueExcl` (the supplier's quoted trade value) is an *input*, not
   derived; the retail columns are derived for the FBR-style invoice display, and the tax
   is backed by that retail statutory value. The sales tax rounds on the **line total**
   (one rounding), not per carton.
4. Persist the items, then aggregate the header totals via `aggregateRestockLines`
   (`RestockRepository` computes the sums from the stored lines) so header and lines can
   never disagree.

### Marking received (`RestockService.markReceived`)

This is where stock and cost update:

1. For each received line, post a `restock` stock movement of
   `qtyCartons × piecesPerCarton` **pieces** (stock is always counted in pieces).
2. Compute the per-piece landed cost as **inclusive** of the whole line payable:
   `round(discountedValueInclusive / (qtyCartons × piecesPerCarton))` —
   `restockLineUnitCost()`.
3. Update `products.baseCostPrice` to that inclusive per-piece cost (unless the caller
   passes `updateCost: false`).
4. Set status to `received`. Receipt is duplicated-guarded and wrapped in a transaction;
   received restocks report warnings in the list when stock is missing versus what was
   received.

### Numbering

Restock references are `RS-000001`, monotonic from a counter in settings plus a
max-existing scan; a deleted number is never reused.

### Getting the math identical on the form

The React form shows live header totals using the exact same `computeRestockLineTotals` /
`aggregateRestockLines` functions the main process persists with — so what you see typed
into `RestockForm` is what lands in `restock_items`, byte for byte.

---

## 10. The sales side (invoices, customers, payments)

- **Invoice totals** are computed by `calculateInvoiceTotals` in
  `src/shared/calc/invoice-totals.ts`: subtotal → whole-invoice discount (capped at
  subtotal, spread per line proportionately with a rounding sweep) → tax on
  `(subtotal − discount)` → total. Profit is `(subtotal − discount) − cost`; tax is not
  profit. The same function powers the form preview and persistence.
- **Cost at time of sale:** each invoice item stores `unitCost`, so later supplier price
  changes never retroactively change historical profit.
- **The min-price floor:** the invoice form refuses a unit price below the product's
  `minSalePrice`; the service enforces the same rule server-side.
- **Over-sell guard and stock consumption:** creating an invoice deducts stock (a `sale`
  movement) and fails if stock would go negative; quantity is checked against
  `currentStock` atomically.
- **Status / overdue:** `computeInvoiceStatus` derives status from paid vs outstanding
  and the due date; `markOverdue` runs at startup and on relevant mutations.
- **Ledger & payments:** each invoice and each payment writes
  `customer_ledger` rows; payment allocations determine exactly which invoices were paid;
  the running balance is synchronised and repaired (migration 005) and kept consistent on
  payments, reversals, and cancellations. Partial payments are fine — the invoice shows
  "Partially paid" and the exact remainder.

---

## 11. Stock movements — the audit trail

`inventory.repository` / `inventory.service` own stock. Each change is a row in
`stock_movements`:

```
type ('opening_stock' | 'restock' | 'sale' | 'adjustment' |
      'damage' | 'return' | 'other')
quantity          the delta (signed)
previousQuantity  balance before
newQuantity       balance after
referenceType/id  link to the causing invoice / restock / adjustment
cost              snapshot (used on sale lines)
```

The product's `currentStock` is simply the latest movement's `newQuantity`. Updates are
atomic single-statement transactions (`previousQuantity = currentStock`), so races cannot
corrupt the chain. The History screen in the UI is a direct read of this table; the
whole ledger is the source of **"why is the number what it is"**.

Invariant: **1 stock unit = 1 piece.** Everything that arrives (cartons) or leaves
(invoices, adjustments) is converted to pieces at the boundary:
`pieces = qtyCartons × piecesPerCarton` on receipt, and invoice lines are inherently
pieces.

---

## 12. Settings and the business profile

- **Business profile** (`business_profile`): company identity, address, NTN/CNIC, taxes
  shown on invoices, invoice numbering counter.
- **Settings** (key/value, `settings` table): UI defaults, restock number counter, and —
  added by migration 006 — the two purchase-tax defaults:
  - `purchaseSalesTaxRateBps = '1800'` (18.00%)
  - `purchaseAdvanceTaxRateBps = '10'` (0.10%)
  - Editable on the Settings screen ("Purchase (restock) tax defaults") via
    `api.settings.bulkUpdate`; each restock line still overrides per-line via its bps
    fields.

---

## 13. CSV import and export

- Modes are defined in `src/shared/types/csv.ts` and implemented in
  `src/main/services/csv.service.ts` (+ `src/main/services/csv/parser.ts`).
- **Export** dumps the requested entity (products, customers, invoices, restocks, etc.)
  to a CSV file. Money cells are written as decimals (stored minor units ÷ 100);
  `MONEY_FIELD_KEYS` lists which export columns need that conversion. Restock exports
  include `qtyCartons`, `piecesPerCarton`, `netSalesValueExcl`, `tradeDiscountValue`,
  and the header tax references.
- **Import** parses decimal money cells into integer minor units and runs the same
  validation paths as the UI (e.g. restock import validates lines and defaults tax rates
  from settings the same way `RestockService.create` does). Warnings/errors from the
  duplicate‑line and validation checks are reported back per row.

The import pipeline deliberately reuses the DTOs and services: there is no second,
looser set of rules that could differ from the UI.

---

## 14. Tests and how to run them

```bash
npm run typecheck      # tsc --noEmit across the whole project
npm test               # unit suites via tests/run-unit.mjs (Vitest)
npm run test:e2e       # build + launch real app on a throwaway user-data dir + drive it
                       #   via Chrome DevTools Protocol; real data untouched
                       #   (add -- --no-build to reuse the last build)
npm run build          # electron-vite production build
npm run dev            # electron-vite dev (hot reload)
npm run dist:win       # packaged Windows installer
```

Unit tests use an isolated temp `userData` (env `TEST_USER_DATA`) so every suite runs the
full migration chain against a clean DB:

- `tests/unit/restock-totals.test.ts` — the purchase formulas, override path, aggregation,
  and unit-cost math (§9).
- `tests/unit/migration-006.test.ts` — upgrades a v5 database to v6, checks data
  integrity and idempotency of the rebuild.
- `tests/unit/stock.test.ts` — movement chain, cartons→pieces receipt, inclusive-cost
  update.
- Other suites cover invoices, payments, ledger, customers, CSV, settings, reports.

The end-to-end suite (`tests/e2e/e2e.mjs`, `e2e-round2.mjs`) drives the fully built
app through the real renderer → preload → IPC → SQLite path: it types into forms,
asserts persisted rows, and collects any renderer exceptions. It aborts if the database
does not live under the isolated user-data dir (isolation guard).

---

## 15. Common changes cookbook

**Add a column / table (schema change).**
1. Write a new migration file (e.g. `007_example.ts`) exporting `up(db)`; follow the idempotency
   guards of 006 (column existence checks, `INSERT OR IGNORE` seeds).
2. Register it at the end of `migrations/migrate.ts`.
3. Update the matching repository (SQL) and shared type/`DTO`.
4. Update the renderer hook/types/form if the UI surfaces it.
5. Add/refresh a migration test (`tests/unit/migration-00N.test.ts`) verifying an older DB
   upgrades cleanly.

**Change a money calc.**
Only ever touch `src/shared/calc/restock-totals.ts` or `invoice-totals.ts`; the form
preview and the persistence path automatically stay in sync. Verify with the
`restock-totals.test.ts` / invoice test suites.

**Add an IPC call.**
Add the channel name to `src/shared/ipc-channels.ts`, register a handler in the domain's
`src/main/ipc/*.ipc.ts`, expose it in `src/preload/index.ts`, and add a typed method to
`src/renderer/src/lib/api.ts`. That compiles everywhere the renderer may call it.

**Add a per-line restock field.**
Extend `CreateRestockItemDTO` + `restock_items`, persist+default it in
`RestockService.resolveItems` / `RestockRepository`, surface it in
`restock-form.ts` + `RestockForm.tsx` + `RestockDetailPage.tsx`, and add the column to the
CSV export list (and import parser) if it should round-trip.