# Fix Prompt — Round 2 — MajidZiaTraders

**What this is:** the result of **retesting on 2026-09-10** after the first round of fixes (`FIX_PROMPT.md`), written as a ready-to-use prompt for an AI coding assistant or a developer.

## Retest summary

| Check | Before round 1 | Now |
|---|---|---|
| `npm run typecheck` | 26 errors | **0 errors** ✅ |
| `npm run build` | passes | passes ✅ |
| Main end-to-end suite (`tests/e2e/e2e.mjs`, 44 checks) | 17 / 44 | **44 / 44** ✅ |
| Migration 004 on a copy of the real database | — | ✅ Data kept, integrity OK, default profile created |
| Migration 004 on synthetic legacy data | — | ⚠️ Stock chain repaired, but customer ledgers are out of sync (R2-1) |
| **New round-2 checks** (`tests/e2e/e2e-round2.mjs`, 9 checks) | — | **0 / 9** ❌ |
| Code review of the remaining round-1 items | — | 17 still open or only partly fixed |

All tests ran on isolated test databases. The real database was only ever read (checksum unchanged).

**Round 1 is mostly done.** The stock corruption, the fresh-install blocker, the payment-delete crash, restore breaking the app, product deletion wiping invoices, tax and profit maths, CSV import and export, times and dates, and currency are all fixed and verified.

**What's left:** **28 issues**: 6 high (data integrity), 12 medium, 10 low.

**How to use it:** open the project in Claude Code and paste everything below the line.

---

<!-- ======================= COPY FROM HERE ======================= -->

# Task: fix the remaining issues found in the MajidZiaTraders round-2 retest

You're working on **MajidZiaTraders**, an offline desktop app for inventory, invoicing and customer accounts. A first round of fixes has already been applied, and the main 44-check end-to-end suite passes. Fix **all** issues below **without breaking any of those 44 checks**, verify each fix, and report back.

## Project facts
- Stack: **Electron 44 + electron-vite 5 + Vite 7 + React 19 + TypeScript + better-sqlite3**.
- Layers: `src/renderer` → `src/preload/index.ts` (`window.api.invoke`) → `src/main/ipc/*.ipc.ts` → `src/main/services/*` → `src/main/repositories/*` → SQLite (`app.getPath('userData')/inventory.db`, WAL mode).
- Shared code: `src/shared/*` (`@shared/*`). `src/shared/date.ts` has `localDate()`.
- **Money is integer cents.** Stock = `newQuantity` of the latest `stock_movements` row, by `id`.
- Payments are applied to invoices through the `payment_allocations` table (paymentId, invoiceId, amount). An invoice's `paid` = the sum of its allocations.
- Repositories share `runInTransaction()` from `BaseRepository`. `db` is a getter that always returns the live connection.
- Migrations 001–004 exist and **004 may already have run on real machines. Don't edit 001–004.** Put every schema or data fix in a new **`005_...ts`** (and later) migration, registered in `migrate.ts`. Migrations must be **idempotent** and keep all data.
- Scripts: `npm run dev`, `npm run build`, `npm run typecheck`.

## Ground rules
1. Work in order: **High → Medium → Low.**
2. Keep business rules in services and shared calculations in `src/shared`, so the screens and the backend can't disagree.
3. Every multi-step write runs in **one transaction**.
4. **Never test against the real database.** Use `--user-data-dir` pointing to a temp folder (see Verification).
5. When done: `npm run typecheck` = 0 errors, `npm run build` passes, **main suite 44/44** and **round-2 suite 9/9**.
6. Where an issue says **"Design decision"**, implement the recommended option and mention it in your report.

---

## HIGH (data integrity)

### R2-1. Migration 004 recalculates invoice totals but not the customer ledger, so balances disagree
- **Evidence:** synthetic legacy invoice: subtotal 150.00, discount 10.00, tax 10%, fully paid 155.00 under the old maths. After migration 004:
  - Invoice total **154.00**, paid **155.00**, **outstanding −1.00** (status "paid").
  - The customer ledger debit for that invoice is still **155.00**.
  - The customer's ledger balance (15.00) ≠ the sum of their invoice outstanding amounts (14.00).
- **Cause:** `004_invoice_discounts_payment_allocations_and_integrity.ts:151-154` updates `invoices` only. Legacy allocations can exceed the new total.
- **Fix:** new idempotent migration **005** that:
  1. Sets `customer_ledger.debit = invoices.total` for every `referenceType='invoice'` entry that differs.
  2. For any invoice whose allocations exceed its total, **trims the allocations** (newest first) down to the total, so `outstanding ≥ 0`.
  3. Re-applies the freed amount to the customer's other open invoices, oldest first. Anything left over stays as customer credit.
  4. Recomputes `paid`, `outstanding` and `status` for the affected invoices.
- Also make the invoice write path enforce **`outstanding ≥ 0`** and **ledger debit = invoice total**. Add a small `assertInvoiceConsistency(invoiceId)` helper that services call in development builds.
- **Accept:** run the app on a legacy database like the one described (see Verification step 4). Every invoice has `outstanding ≥ 0`, each customer's ledger balance = the sum of their invoice outstanding amounts − their unapplied credit, and `PRAGMA foreign_key_check` is empty.

### R2-2. The safety copy made before a restore can be empty (total data loss)
- **Evidence (X-9):**
  - A product created just before **Restore** was **missing** from the automatic safety copy (`$TMPDIR/inventory-before-restore-*.db`).
  - On a second run with a fresh database, the safety copy was a **4 KB file with no tables at all** (`no such table: products`), while the live database was 233 KB. Every change was still in the WAL journal.
  - So if the user restores the wrong backup, the safety copy they'd rely on can hold nothing.
- **Cause:** `backup.service.ts:113-117` uses `fs.copyFileSync` on the live database. In WAL mode, recent writes are still in `inventory.db-wal`, so they're lost. The copy also goes to the OS temp folder, which the system clears.
- **Fix:**
  - Create the safety copy with `await getDatabase().backup(dest)` (make `restoreBackup` async).
  - Store it in `userData/backups/before-restore-<timestamp>.db`.
  - Keep the last 10 copies.
  - Include the path in the success message shown in Settings.
- **Accept:** X-9 passes.

### R2-3. Backups made with the previous version can no longer be restored
- **Evidence (X-8):** a valid pre-update backup (schema v3) is rejected with *"Incompatible backup: missing tables (payment_allocations)"*.
- **Cause:** `backup.service.ts:8-23` `REQUIRED_TABLES` includes tables that migrations create.
- **Fix:**
  - Validate against the **core tables that have existed since v3**, and read `_migrations` to get the backup's version.
  - Accept backups with version ≤ the app's latest; migrations upgrade them when the database is reopened after the restore.
  - Reject only backups **newer** than the app, with a clear message ("This backup was made by a newer version of the app").
  - Return the backup's version in `BackupValidation`.
- **Accept:** X-8 passes. Restoring `tests/e2e/fixtures/v3-empty-backup.db` in the test app works, and migrations 004 and later run on it.

### R2-4. Deleting a stock adjustment corrupts the stock number
- **Evidence (X-4):** stock 98 → adjustment −10 (88) → adjustment −1 (87). Deleting the **first** adjustment left stock at **87** instead of **97**.
- **Cause:** `stock-adjustment.service.ts:64-75` deletes the adjustment's `stock_movements` row from the middle of the chain. Later rows still carry the old `newQuantity`.
- **Fix:** never delete movement rows. **Reverse** instead:
  - In one transaction, insert a new movement (`type 'adjustment'`, `quantity = −original`, reason "Reversal of adjustment #id").
  - Mark the adjustment reversed (add `reversedAt` / `reversalMovementId` columns in migration 005), or delete only the adjustment row.
  - Refuse the reversal if it would make stock negative.
- **Accept:** X-4 passes.

### R2-5. Discounts larger than the subtotal are accepted, and reports show negative revenue
- **Evidence (X-2):** an invoice with a 9,999.99 discount on a 10.00 subtotal was saved (`total 0`, `discount 999999`). The **Sales report showed revenue −9,825.99** for the day.
- **Cause:** `invoice.service.ts:65-67` only checks for a non-negative whole number. `invoice.repository.ts:149-153` clamps the tax base but stores the raw discount, and reports sum `subtotal − discount`.
- **Fix:**
  - Reject `discount > subtotal` in the service and in the form.
  - Put **one shared calculation** in `src/shared/calc/invoice-totals.ts` (subtotal, discount, tax, total, profit, line discounts) and use it in `invoice.repository.ts`, `InvoiceForm.tsx` and migration 005.
- **Accept:** X-2 passes.

### R2-6. `invoices:update` can change money fields without recalculating totals
- **Evidence (X-3):** `invoices:update(id, { discount: 500 })` was accepted. The discount became 5.00, but the **total and outstanding stayed at 10.00**, and the ledger was unchanged.
- **Cause:** `invoice.service.ts:125-138` and `invoice.repository.ts:223-255` write `customerId`, `taxRate`, `discount` and `date` as given.
- **Fix:** allow updates to **`notes` and `dueDate` only** (recompute the status after a `dueDate` change), and reject every other field with *"Cancel the invoice and create a new one to change amounts or customer."*
- **Accept:** X-3 passes.

---

## MEDIUM

### R2-7. Payments applied automatically don't appear on the invoice they paid
- **Evidence (X-1):** a payment with no invoice was allocated to invoice `Ia` (its paid amount went from 0 to 5.00), but `payments:list-by-invoice(Ia)` returns **0 payments**. The Payments screen shows **"—"** in the Invoice column.
- **Cause:** `payment.repository.ts:54-58` and `DETAIL_SELECT` look at `customer_payments.invoiceId`, which is NULL for auto-applied payments.
- **Fix:**
  - List an invoice's payments by joining `payment_allocations`, showing the **amount applied to that invoice**.
  - In the Payments list, show the invoice number(s) a payment was applied to.
  - On the Invoice page, if deleting a payment will also affect other invoices, say so before deleting.
- **Accept:** X-1 passes.

### R2-8. Customer credit isn't applied to new invoices
- **Evidence (X-5):** the customer paid 7.00 with no open invoice (credit). The next invoice of 10.00 shows **outstanding 10.00**, while the customer's balance says they owe **3.00**.
- **Design decision. Recommended:** when an invoice is created, apply the customer's **unallocated payment amounts** (payment amount − allocations), oldest payment first, inside the same transaction. Show "Credit applied" on the invoice page.
- **Accept:** X-5 passes.

### R2-9. Overdue status only updates when the Dashboard is opened
- **Evidence (X-6):** an invoice created with due date 2026-08-10 is listed as **"sent"** until someone opens the Dashboard.
- **Where:** `markOverdue` is only called from `dashboard.service.ts:22` and `invoices:refresh-overdue`.
- **Fix:**
  - Work out the correct status when an invoice is **created**, and after a due-date change.
  - Call `markOverdue(localDate())` at app start and before invoice lists, invoice details, customer pages and reports.
- **Accept:** X-6 passes.

### R2-10. Invoice CSV export writes the discount in cents
- **Evidence (X-7):** discount cells were `500` and `999999` while the total cells were `10.00`.
- **Where:** `csv.service.ts:200`, where `MONEY_FIELD_KEYS.invoices` lacks `discount`.
- **Fix:** add it, and check every export column for money fields.
- **Accept:** X-7 passes.

### R2-11. The invoice form's "Estimated profit" includes tax
- **Where:** `InvoiceForm.tsx:43` computes `profit = total − totalCost`, where total includes tax. The saved invoice uses `subtotal − discount − cost`. So the screen and the stored figure differ whenever tax > 0.
- **Fix:** use the shared calculation from R2-5.

### R2-12. No error boundary: any screen error still blanks the whole window
- **Where:** `App.tsx`. Nothing catches render errors (the original C3 request).
- **Fix:** add a top-level error boundary with a friendly message and a **Reload** button, and log the error.

### R2-13. There's still no screen to manage categories
- **Evidence:** nothing in the renderer calls `categories.create`, `update` or `delete`. The backend already supports them.
- **Fix:** add category management (list, add, rename, activate/deactivate, delete, with the existing "in use" guard) as a tab on Products or a section in Settings.

### R2-14. No unit tests and no test scripts
- **Fix:**
  - Add **Vitest** with `npm test`, running services against a temporary SQLite file. Cover: invoice totals and discount limits, payment allocation and credit, adjustment reversal, migration 005 on legacy data, backup validation of old versions, and CSV round-trip.
  - Add `npm run test:e2e`, which builds, launches the app on a temp `--user-data-dir`, runs `tests/e2e/e2e.mjs` and `tests/e2e/e2e-round2.mjs`, and stops the app.

### R2-15. The New-invoice form uses stale stock and customer data
- **Where:** `InvoiceList.tsx:26-28` loads products and customers once, on mount. `InvoiceForm.tsx:46` `useMemo` is missing `products` in its dependencies.
- **Fix:** reload both each time the form opens and after an invoice is saved, and fix the dependencies.

### R2-16. A blank price skips the minimum-price check in the form
- **Where:** `InvoiceForm.tsx:93` (`price > 0 && …`).
- **Fix:** require a price on every line, and always compare it with the product's minimum.

### R2-17. Profit & Loss explanation text is wrong
- **Where:** `ReportsPage.tsx:196` says net profit is gross profit minus tax collected. In reality expenses = 0 and net = gross.
- **Fix:** correct the text, or hide the Expenses and Net profit cards until expenses exist.

### R2-18. Printed invoices lack the business details
- **Where:** there's an `@media print` block (`globals.css:992`), but the invoice page never shows the business profile (name, address, tax ID) or `invoiceFooter`.
- **Fix:** add a print-only header and footer to `InvoiceDetailPage` from the business profile, and check the print preview hides the sidebar and buttons.

---

## LOW

- **R2-19.** The Stock-movements report filters by UTC date (`inventory.repository.ts:29-30`, `date(m.createdAt)`), so movements made between midnight and 05:00 local time (UTC+5) fall on the previous day. Use `date(m.createdAt, 'localtime')`.
- **R2-20.** Money has no thousands separators (`format.ts:14`, e.g. `PKR 115300.00`). Use `Intl.NumberFormat(undefined, { style: 'currency', currency })`, with a fallback for unknown codes.
- **R2-21.** After a successful restore the screen isn't reloaded, so the currency and open lists can be stale (`SettingsPage.tsx` restore handler). Call `window.location.reload()` after success.
- **R2-22.** **Mark received** and **Cancel restock** act on one click (`RestockDetailPage.tsx:153,164`). Add a confirmation, since both are irreversible.
- **R2-23.** Restock numbers use `MAX(id)+1` (`restock.repository.ts:38-43`), which leaves gaps and can reuse numbers after deletes. Store a counter, like invoice numbers.
- **R2-24.** Security hardening (from round 1, not done):
  - `preload/index.ts` exposes a generic `invoke(channel)`. Allow only channels listed in `src/shared/ipc-channels.ts`.
  - `main/index.ts` has `sandbox: false`; consider `true`.
  - Add `setWindowOpenHandler` → deny, and block `will-navigate`.
  - For CSV and backup file paths, only accept paths the user chose in a dialog.
- **R2-25.** The Dashboard runs one ledger query per customer (`dashboard.service.ts:28`). Use one aggregate query.
- **R2-26.** Migration 004 runs `PRAGMA foreign_keys = OFF` inside the transaction that `migrate.ts:35` opens, where SQLite ignores it. It worked only because nothing references the rebuilt tables. For future table rebuilds, use `PRAGMA defer_foreign_keys = ON` plus a `foreign_key_check`, and document this in `migrate.ts`.
- **R2-27.** `stock_movements` and `stock_adjustments` still have `ON DELETE CASCADE` from `products`. A product with only opening stock can be deleted, and its stock history goes with it. Either block the delete when movements exist, or change the rule in migration 005.
- **R2-28.** `opening_stock` rows written before migration 004 keep the absolute quantity in `quantity`, so History shows "+100" for old data. Migration 005 should rewrite those rows as `quantity = newQuantity − previousQuantity`.

---

## Verification (required)

1. `npm run typecheck` shows **0 errors**, and `npm run build` succeeds.
2. Run both end-to-end suites against a temporary database. `sqlite3` must be available (it is on macOS):
   ```bash
   npm run build
   TEST_DIR=$(mktemp -d)
   node_modules/.bin/electron . --remote-debugging-port=9334 --user-data-dir="$TEST_DIR/e2e-userdata" &
   node tests/e2e/e2e.mjs "$TEST_DIR"
   node tests/e2e/e2e-round2.mjs "$TEST_DIR"
   pkill -f "remote-debugging-port=9334"
   ```
   Required: **44/44** and **9/9**. The failing round-2 baseline is in `tests/e2e/baseline-round2-results.json`.
3. `npm test` (new unit tests) passes.
4. **Legacy migration check:**
   - Start from `tests/e2e/fixtures/v3-empty-backup.db` (schema v3, no data). Insert an invoice with discount + tax, fully paid under the old maths (tax on the full subtotal), a payment without an invoice, and a same-second corrupted stock chain.
   - Launch the app on it with a temp `--user-data-dir`.
   - Confirm: migrations reach the latest version; `PRAGMA integrity_check` = ok; `PRAGMA foreign_key_check` is empty; every invoice has `outstanding ≥ 0`; ledger debits = invoice totals; the stock chains are consistent.
5. **Manual checks in `npm run dev`:**
   - Restore an old (v3) backup through Settings: it works, and the safety copy is in `userData/backups`.
   - Record a payment with no invoice, then open the invoice it was applied to: the payment is listed.
   - Force a render error: the error boundary appears instead of a blank window.
   - Manage categories.
   - Print an invoice: the business header and footer appear.

## Report back with
- A table: **issue ID → change (files) → how you verified it.**
- Design decisions you made (R2-8 and any others).
- The final output of the type-check, both e2e suites and `npm test`.

<!-- ======================= COPY UNTIL HERE ======================= -->
