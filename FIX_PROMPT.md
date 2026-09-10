# Fix Prompt — Inventory Manager

**What this is:** the result of a deep test of the app on 2026-09-10, written as a ready-to-use prompt for an AI coding assistant (such as Claude Code) or a developer.

**Testing done**
- `npm run typecheck` and `npm run build`
- A full code review of the main process, repositories, services, IPC and all screens
- **44 automated end-to-end checks** run through the real app (renderer → preload → IPC → SQLite) on an **isolated test database**. Your real data wasn't touched: its checksum was the same before and after.

**Result:** 17 passed, **27 failed**. Together with the code review, that's **36 distinct issues**: 6 critical, 9 high, 13 medium, 8 low.

**How to use it:** open this project folder in Claude Code (or give this file to a developer) and paste everything below the line.

---

<!-- ======================= COPY FROM HERE ======================= -->

# Task: fix every issue found in the Inventory Manager deep test

You're working on **Inventory Manager**, an offline desktop app for inventory, invoicing and customer accounts. Fix **all** issues listed below, verify each fix, and report back.

## Project facts
- Stack: **Electron 44 + electron-vite 5 + Vite 7 + React 19 + TypeScript + better-sqlite3 (SQLite)**.
- Layers: `src/renderer` (React screens) → `src/preload/index.ts` (`window.api.invoke`) → `src/main/ipc/*.ipc.ts` → `src/main/services/*` (business rules) → `src/main/repositories/*` (SQL) → SQLite at `app.getPath('userData')/inventory.db`.
- Shared types: `src/shared/types/*`. Path alias `@shared/*`.
- **Money is stored as integer cents** everywhere (e.g. `$12.50` = `1250`). Screens convert dollars ↔ cents.
- Stock isn't a column. It's the `newQuantity` of the latest row in `stock_movements` for each product.
- Migrations: `src/main/database/migrations/` (001–003, run by `migrate.ts`). **Never edit 001–003.** Put every schema or data change in a new **`004_...ts`** (and later) migration, registered in `migrate.ts`. Migrations must preserve existing data. (Note: 003 drops all tables, which is only safe because it runs once on install.)
- Scripts: `npm run dev`, `npm run build`, `npm run typecheck`.

## Ground rules
1. Work in priority order: **Critical → High → Medium → Low.**
2. Match the existing code style (repository/service/IPC pattern, hooks returning `Promise<string | null>` errors).
3. Keep business logic in **services** and put shared calculations in `src/shared`, so the screens and the backend can't disagree.
4. Multi-step writes (stock + ledger + invoice/payment) must run inside **one transaction**.
5. **Never test against the real database.** Always launch the test app with `--user-data-dir` pointing to a temp folder (see Verification).
6. When done, `npm run typecheck` must report **0 errors** and `npm run build` must pass.
7. Where an issue says **"Design decision"**, implement the **recommended** option unless the project owner says otherwise, and mention it in your report.

---

## CRITICAL

### C1. Stock numbers get corrupted when two stock changes happen in the same second
- **Test result (S-1, S-3, S-4, C-2, R-3):** opening stock 100, then −10, then −5. Expected 85. The app reported **100** in one place and **95** in another. The movement chain was `0→100`, `100→90`, **`100→95`**. Every later figure was wrong, and the stock guards used the wrong "Available" number.
- **Cause:** `src/main/repositories/inventory.repository.ts:42`: `findLatestByProductId` uses `ORDER BY createdAt DESC LIMIT 1`. `createdAt` is `datetime('now')`, which only has **one-second precision**, so ties return the oldest row. Meanwhile `getCurrentQuantities` (line ~60) uses `MAX(id)`, so the two disagree. `findByProductId` (line 8) has the same tie problem, which scrambles the History order.
- **Fix:**
  - Use `ORDER BY id DESC` (the id is monotonic) in every "latest movement" or history query. Use one helper as the single source of truth for current stock.
  - Make "read current quantity + insert movement" atomic: run it inside a transaction.
  - Add migration **004** that **repairs existing data**: for each product, walk its `stock_movements` in `id` order and recompute `previousQuantity` and `newQuantity`. Treat `opening_stock` rows as setting the absolute value; see M7.
- **Accept:** S-1, S-3, S-4, C-2 and R-3 pass. The same numbers appear in Products, Inventory, Dashboard and in the invoice stock checks.

### C2. Invoices can't be created on a fresh install, and Settings can't create the business profile
- **Test result (UI-1, I-0):** a fresh database has **no `business_profile` row**. Creating an invoice fails with *"Business profile not configured"*. In Settings, **Edit doesn't open the form**: `SettingsPage.tsx:172` renders it only when `formOpen && profile`. The owner's real database has 0 profile rows today.
- **Fix:**
  - Migration 004 inserts a default profile row if none exists (name `My Business`, currency `USD`, prefix `INV-`, next number 1, tax 0).
  - Also make `SettingsPage` open the form with empty defaults when `profile` is null.
  - Optional: prompt for the business name on first run.
- **Accept:** UI-1 and I-0 pass. On a brand-new install the user can open Settings → Edit → Save, then create an invoice.

### C3. Deleting a payment on the Invoice details page crashes the whole screen (white screen)
- **Test result (UI-7):** React error **#31** ("object with keys {success}"). The screen went blank; the payment *was* deleted.
- **Cause:** `src/renderer/src/features/invoices/components/InvoiceDetailPage.tsx:75-81` calls `const err = await api.payments.delete(id)`. That returns `{ success: true }`, which is then passed to `setActionError(err)` and rendered as a React child.
- **Fix:**
  - Use `usePayments().deletePayment` (which returns `string | null`) or a proper `try/catch`.
  - Add a top-level **React error boundary** in `App.tsx`, so a render error shows a message with a "Reload" button instead of a blank window.
- **Accept:** UI-7 passes, and no page ever renders an object as text.

### C4. Restoring a backup breaks the app until it's restarted
- **Test result (BK-3):** after `backup:restore`, every call fails with **"TypeError: The database connection is not open"**.
- **Cause:** `src/main/repositories/base.repository.ts` stores `this.db = getDatabase()` in the constructor. Services are singletons created at startup. `replaceDatabaseFromFile()` (`src/main/database/connection.ts:50-55`) closes that connection and opens a new one, but every repository still holds the closed one.
- **Fix:**
  - Make the repositories always use the current connection, e.g. `protected get db() { return getDatabase() }`.
  - Before restoring, **automatically save a safety copy** of the current database next to it (e.g. `inventory.before-restore-<timestamp>.db`).
  - After a successful restore, have the renderer reload (`window.location.reload()`) so every screen refetches.
- **Accept:** BK-3 passes. After a restore, lists show the restored data without restarting.

### C5. CSV import and Restore-from-backup do nothing after you pick a file
- **Cause (code-verified):** `src/main/ipc/dialog.ipc.ts:15` returns `{ canceled, filePaths }` (an array). But `SettingsPage.tsx:56` and `CsvWizard.tsx:27` check `file.filePath` (singular), which is always `undefined`, so both silently `return`. The Settings restore flow also reads `validation.ok` and `validation.errors` (`SettingsPage.tsx:59-60`), which don't exist; the service returns `{ valid, message, integrity, tables, metadata }` (test BK-2).
- **Fix:**
  - Make `dialog:select-file` return `filePath: result.filePaths[0] ?? null` (you can keep `filePaths` too), and update `FileDialogResult` in `src/renderer/src/lib/api.ts`.
  - Make `SettingsPage` use `validation.valid` and `validation.message`.
- **Accept:** in the running app, CSV Tools → Choose CSV file shows the preview, and Settings → Restore validates, confirms and restores. BK-2 passes (see the updated check in `tests/e2e/e2e.mjs`).

### C6. Deleting a product silently deletes its lines from past invoices (data loss)
- **Test result (D-1):** a product sold on an invoice was deleted. The invoice went from **1 line to 0 lines** but still charges the customer 400. Its stock history, stock adjustments and restock lines were deleted too.
- **Cause:** `003_complete_business_schema.ts` lines **82, 96, 167, 196**: `REFERENCES products(id) ON DELETE CASCADE` on `stock_movements`, `stock_adjustments`, `invoice_items` and `restock_items`. `product.service.ts:151` `delete()` has no guard.
- **Fix:**
  - In `ProductService.delete`, **refuse** when the product has any invoice items, restock items, stock movements or adjustments, with the message *"This product has history. Deactivate it instead."* (the same pattern customers use).
  - Recommended: in migration 004, rebuild those four tables with `ON DELETE RESTRICT`. Do it inside a transaction with `foreign_keys=OFF`, copy the rows, then run `PRAGMA foreign_key_check`.
- **Accept:** D-1 passes. A product that has been sold can't be deleted.

---

## HIGH

### H1. Invoice tax is calculated differently by the form and by the backend
- **Test result (I-1):** subtotal 150.00, discount 10.00, tax 10%. The **form showed** tax 14.00 and total 154.00; the app **saved** tax 15.00 and total 155.00.
- **Cause:** `InvoiceForm.tsx:40` taxes `(subtotal − discount)`, while `invoice.repository.ts:146-148` taxes `subtotal`.
- **Fix:**
  - Create one shared function, `src/shared/calc/invoice-totals.ts`, with **tax = round((subtotal − discount) × rate / 100)** and **total = subtotal − discount + tax**.
  - Use it in both the form and the repository. The backend's numbers are the ones that count.
  - Validate that discount ≤ subtotal.

### H2. Profit includes tax and ignores the discount at line level
- **Test result (I-2, RP-1, RP-4):** expected invoice profit 40.00, **saved 55.00** (tax counted as profit). The Sales report product rows (profit 53.00) don't add up to the summary card (60.00). Profit & Loss gross profit includes the tax collected.
- **Cause:** `invoice.repository.ts:149` computes `totalProfit = total − totalCost` (tax included). Line profit is `lineSubtotal − lineCost` (discount ignored). Reports sum `invoices.total` as revenue.
- **Fix:**
  - **Net revenue = subtotal − discount.** Profit = net revenue − cost.
  - Spread the invoice discount across its lines in proportion to their value (store it, e.g. `lineDiscount`), so line figures add up to invoice figures.
  - Reports and the Dashboard use net revenue (tax excluded), and show **Tax collected** as a separate figure.
  - Data migration: recompute `totalProfit` and the line figures for existing invoices.
- **Accept:** I-2, RP-1 and RP-4 pass. Product rows add up exactly to the summary cards.

### H3. Inventory report card says "Stock value (cost)" but shows the value at selling price
- **Test result (RP-2):** the card showed 2,267.00; the real value at cost is 1,495.00.
- **Cause:** `report.service.ts:86` (`totalValue = qty × sellingPrice`) and `ReportsPage.tsx:210` (the label).
- **Fix:** return both `totalCostValue` and `totalRetailValue`, and show two correctly labelled cards.

### H4. CSV import creates products from rows that have errors
- **Test result (CSV-1):** a row with `baseCostPrice = abc` was reported as an error **and still imported**, with cost 0. The counts were imported 2 + skipped 2 = 4, for a 3-row file.
- **Cause:** `csv.service.ts:244-257`: the `continue` inside the inner `for…of` over price fields only continues the inner loop.
- **Fix:** use a flag or a labelled `continue` so an invalid cell skips the whole row. `imported + skipped` must equal `totalRows`.

### H5. CSV export writes money in cents, but import expects dollars
- **Test result (CSV-2):** a product with selling price 2.00 exported as `200`. Importing that file again would store 200.00.
- **Cause:** `csv.service.ts` `export()` writes raw database values.
- **Fix:** format every money column (product prices, invoice amounts, payment amounts, restock totals, sales revenue/cost/profit) as decimals (`2.00`). An export must re-import unchanged.

### H6. Times are shown 5 hours off (UTC shown as local time)
- **Test result (UI-5):** a stock movement created at **3:19 PM** local time showed as **10:19**.
- **Cause:** SQLite `datetime('now')` stores UTC as `"YYYY-MM-DD HH:MM:SS"` with no zone. `formatDateTime` in `src/renderer/src/lib/format.ts` parses that as local time.
- **Fix:** treat SQLite timestamps as UTC (`value.replace(' ', 'T') + 'Z'`) before formatting. Keep plain `YYYY-MM-DD` business dates as calendar dates, with no timezone shift.

### H7. "Today" is calculated in UTC, which is wrong for users east or west of UTC
- **Test result (UI-6):** the Reports default range starts on **2026-08-31** instead of **2026-09-01** (the owner is at UTC+5). Between 00:00 and 05:00 local time, new invoices, payments and restocks default to **yesterday**, the Dashboard "today" shows yesterday, and overdue checks are off by a day.
- **Where:** `toISOString().split('T')[0]` appears in 13 places: `SettingsPage.tsx:37`, `payment-form.ts:20`, `invoice-form.ts:42`, `restock-form.ts:28`, `useReports.ts:17-18`, `payment.repository.ts:72`, `customer-ledger.repository.ts:90`, `payment.service.ts:54,126`, `csv.service.ts:21`, `dashboard.service.ts:19`, `customer-ledger.service.ts:98`. Also `invoice.repository.ts:253` uses SQLite's `date('now')` (UTC).
- **Fix:**
  - Add `localDate(d = new Date())` → `YYYY-MM-DD` in local time to `src/shared`, and use it everywhere.
  - Pass the local "today" into `markOverdue(today)` instead of using `date('now')`.

### H8. Payments without an invoice never reduce any invoice's outstanding amount
- **Test result (P-5):** a 10.00 "generic" payment lowered the customer's balance from 105.00 to 95.00, but the invoice stayed at 105.00 outstanding (and can become *Overdue*).
- **Design decision. Recommended:** allocate a payment without an invoice to the customer's **oldest open invoices first (FIFO)**.
  - Record the allocations in a new `payment_allocations` table (paymentId, invoiceId, amount).
  - An invoice's `paid` = the sum of its allocations. Deleting a payment reverses its allocations.
  - Keep any remainder as customer credit, shown on the customer page.
  - The alternative (not recommended) is to require an invoice for every payment.
- **Accept:** P-5 passes.

### H9. Invoice status is only refreshed when the Dashboard is opened
- **Cause:** `invoice.repository.markOverdue()` is only called from `dashboard.service.ts:21`.
- **Fix:** also refresh overdue statuses when loading the invoice list, invoice details and reports, and on app start (using the local date from H7).

---

## MEDIUM

### M1. Backend accepts money values that aren't whole cents
- **Test result (V-3):** `sellingPrice: 1234.5` was accepted and stored as 1234.5.
- **Fix:** every service that accepts money (products, invoices, payments, restocks, ledger) must require `Number.isInteger(value) && value >= 0`.

### M2. The New-invoice form ignores the business profile's default tax rate
- **Test result (UI-2):** the profile tax is 10%, but the form showed `0`.
- **Where:** `invoice-form.ts:44`.
- **Fix:** pre-fill the tax rate from `businessProfile.taxRate`. The user can still change it.

### M3. Currency setting is ignored: money always shows `$`
- **Test result (UI-3):** currency set to PKR, screens still show `$`.
- **Where:** `format.ts:3`.
- **Fix:** format with `Intl.NumberFormat(undefined, { style: 'currency', currency })`, using the profile currency from a small React context loaded at startup. Also fix labels like "Selling price ($)" and "Discount ($)".

### M4. Product details panel doesn't refresh after Deactivate or Edit
- **Test result (UI-4):** the product was saved as inactive, but the panel still showed **Active** and a **Deactivate** button. Clicking it again sends the wrong value.
- **Where:** `ProductList.tsx:27` keeps a snapshot of the selected product.
- **Fix:** store `selectedId` and read the product from the refreshed list.

### M5. Receiving a restock doesn't update the product's cost price
- **Test result (R-5):** received at unit cost 9.00, but the product cost stayed at 10.00, so new invoices use a stale cost and profit is wrong.
- **Design decision. Recommended:** on **Mark received**, set `baseCostPrice` to that line's unit cost (last purchase cost). Add a checkbox "Update product cost prices", ticked by default, and still reject a selling price below the minimum.

### M6. Stock-movements report shows "Outbound units" as a negative number
- **Test result (RP-3):** it showed `-31`.
- **Fix:** show the absolute value, or rename the card to "Net outbound".

### M7. Opening stock records the absolute quantity as the movement's change
- **Cause:** `inventory.repository.ts:96-115` `setQuantity` stores `quantity = new total`. So History shows `+100` even when stock was reduced, and the Stock-movements report counts it as inbound.
- **Fix:** store `quantity = newTotal − previous`, keep type `opening_stock`, and have the 004 migration repair existing rows.

### M8. Errors from the Adjust, Opening and Edit-restock forms are hidden behind the pop-up
- **Where (TypeScript errors):** `InventoryList.tsx:131,141` and `RestockDetailPage.tsx:193`. `runAction` and `run` return `void`, so the form never receives the error. The message is shown at the top of the page, *under* the overlay.
- **Fix:** return the error string, so each form shows it inline.

### M9. Profit & Loss explanation text is wrong
- **Where:** `ReportsPage.tsx:196` says net profit is gross profit minus tax collected. In reality expenses are always 0 and net = gross.
- **Fix:** correct the text. Either implement expenses (recommended as a future feature) or hide the Expenses and Net profit cards.

### M10. There's no screen to manage categories
- **Cause:** categories can only be created by a CSV product import. The backend (`categories:*` IPC) already supports everything.
- **Fix:** add category management: a Categories tab on the Products screen, or a section in Settings. It should list, add, rename, activate/deactivate and delete; delete is already blocked while products use the category.

### M11. Printing an invoice prints the whole app window
- **Where:** the Print button calls `window.print()`. The business profile (name, address, tax ID) and `invoiceFooter` are never used.
- **Fix:** add an invoice print layout: `@media print` CSS that hides the sidebar, toolbar and buttons, with a header from the business profile, customer details, lines, totals and the footer.

### M12. The New-invoice form uses stale stock and product data
- **Where:** `InvoiceList.tsx:25-28` loads customers and products once, on mount. `InvoiceForm.tsx:45` `useMemo` is missing `products` in its dependencies.
- **Fix:** reload customers and products each time the form opens and after an invoice is saved, and add the missing dependency.

### M13. The invoice form accepts a blank price and skips the minimum-price check
- **Where:** `InvoiceForm.tsx:92` only checks the minimum when `price > 0`. A blank price becomes 0.
- **Fix:** require a price on every line, and always check it against the minimum.

### M14. 26 TypeScript errors: `npm run typecheck` fails
- Main ones:
  - Services call the `protected transaction()` of other repositories (`invoice.service.ts:88,146,166`, `payment.service.ts:75,104`, `restock.service.ts:89`). Expose a public `runInTransaction` helper instead.
  - `csv.service.ts:57,197`: encoding typed as `string`.
  - `report.service.ts:160,184`.
  - `ReportsPage.tsx:103-109`: nullable report props.
  - `useReports.ts:113`: duplicate export.
  - `SettingsPage.tsx:59-60` (see C5).
  - `ProductList.tsx:35`.
  - `product-form.ts:71`: extra `other` key.
  - `InventoryList.tsx` and `RestockDetailPage.tsx` (see M8).
  - `InvoiceDetailPage.tsx:78` (see C3).
- **Accept:** 0 errors.

### M15. No automated tests
- **Fix:**
  - Add **Vitest** unit tests for the services, using a temporary SQLite file, covering: stock chain, invoice totals and profit, payments (including allocation), cancel/delete reversal, CSV parse/import/export round trip, and backup/restore.
  - Keep the end-to-end script `tests/e2e/e2e.mjs`.
  - Add `npm test` and `npm run test:e2e` scripts.

---

## LOW

- **L1.** `invoices:update` can change customer, tax or discount without recomputing totals or the ledger (API only, no screen uses it). Restrict it to `notes` and `dueDate`, or recompute everything inside a transaction.
- **L2.** `stock-adjustments:delete` deletes the adjustment but not its stock movement, so stock doesn't change. Remove the channel, or reverse the movement inside a transaction.
- **L3.** Restock numbers use `MAX(id)+1` (`restock.repository.ts:38-43`), which leaves gaps after deletes. Use a stored counter, like invoice numbers.
- **L4.** **Mark received** and **Cancel restock** act on a single click. Add a confirmation step, since both are irreversible.
- **L5.** The invoice status `draft` exists but is never used. Remove it from the labels and types, or implement drafts properly.
- **L6.** Migration 003 drops every table. Document this, and add a guard so future migrations can never drop tables that contain data.
- **L7.** Security hardening:
  - The preload exposes a generic `invoke(channel, …)`. Allow only channels listed in `src/shared/ipc-channels.ts`.
  - Consider `sandbox: true`.
  - Deny new windows (`setWindowOpenHandler`) and block navigation (`will-navigate`).
  - For CSV and backup paths, only accept paths the user chose in a dialog.
- **L8.** `dashboard.service.ts:25-31` runs one ledger query per customer. Replace it with one aggregate query.

---

## Verification (required)

1. `npm run typecheck` shows **0 errors**, and `npm run build` succeeds.
2. **End-to-end suite** (`tests/e2e/e2e.mjs`, 44 checks; the failing baseline is in `tests/e2e/baseline-results.json`). Run it against a temporary database:
   ```bash
   npm run build
   TEST_DIR=$(mktemp -d)
   node_modules/.bin/electron . --remote-debugging-port=9334 --user-data-dir="$TEST_DIR/e2e-userdata" &
   node tests/e2e/e2e.mjs "$TEST_DIR"
   pkill -f "remote-debugging-port=9334"
   ```
   The script refuses to run unless the database is in the temp folder. **All 44 checks must pass.** If a design decision changes an expected value, update that check and explain why.
3. **Manual checks in `npm run dev`:**
   - Fresh install (empty user-data dir): Settings → Edit → Save profile → create an invoice.
   - CSV Tools → Choose CSV file → preview → Import.
   - Settings → Create backup, then Restore: data comes back without restarting.
   - Invoice details → delete a payment: no white screen.
   - Print an invoice: clean layout with the business header and footer.
   - Times and "today" are correct in local time.
4. **Migration check:** run the app once against a *copy* of an existing database from before the fixes. Migration 004 must keep all rows, repair the stock chains, recompute profits, and pass `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.

## Report back with
- A table: **issue ID → what you changed (files) → how you verified it.**
- Any design decision where you chose something other than the recommended option.
- The final output of `npm run typecheck` and of the e2e suite.

<!-- ======================= COPY UNTIL HERE ======================= -->
