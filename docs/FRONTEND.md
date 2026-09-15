# Frontend

Short summary of the MZTraders renderer: a React single-page app inside an Electron window. See [DEEP.md](./DEEP.md) for the full walk-through and [STYLING.md](./STYLING.md) for the CSS.

## Entry & root

- `src/renderer/src/main.tsx` renders `<App/>` in React `StrictMode`, wrapped in an `ErrorBoundary`, and imports the single global stylesheet (`styles/globals.css`).
- `src/renderer/index.html` is the HTML shell; the app is bundled by electron-vite into `out/renderer`.

## App shell

`App.tsx` owns top-level state and fake navigation:

- `view` is one of `dashboard | invoices | expenses | customers | products | settings | multiple-invoices`.
- Detail states are tracked separately (`selectedInvoiceId`, `customerDetailId`, `selectedProductId`) — a list view switches to a detail page when one is set, with a back link driven from `App`'s `headers` table.
- `Layout` renders the `Sidebar` (fixed nav from `nav.ts` `NAV_ITEMS`) plus the `Header` (title / back button from `VIEW_TITLES`) around the active page.

## Talking to the backend

`src/renderer/src/lib/api.ts` declares `window.api` and exposes typed `api` groups (`products.*`, `invoices.*`, `dashboard.*`, …). Every call goes through `ipc()` → `window.api.invoke(channel, …)` → preload whitelist → main handler. If the bridge is missing (page opened in a plain browser) it rejects with a friendly error.

## Features (feature folders)

Each domain lives in `src/renderer/src/features/<domain>/components` + `hooks`:

- **Dashboard** — date-range picker feeding `dashboard:summary`; profit per customer, stock remaining/value, invoices + today's dispatches, expenses, amounts owed, cash flow, recent lists; modals backed by `report.ts` (CSV export / print window).
- **Invoices** — `InvoiceList`, `InvoiceDetailPage`, `InvoiceFormPage`/`InvoiceForm` (line-item editor with rate autofill + stock hints), `MultipleInvoicesPage`/`MultiInvoiceForm` (create a batch for the selected route), and the print side: `InvoiceSheet`, `LoadFormSheet`, `LoadFormReport`, `LoadFormBulkPrint`.
- **Customers** — `CustomerList` (route tabs), `CustomerDetailPage` (invoices + payments, pays an invoice, opens invoice), `CustomerForm`, `PayModal`, `RouteNamesModal`; `useCustomers.ts` also persists the selected route (localStorage `mztraders:selected-route`) so shortcuts know what to act on.
- **Products** — `ProductList`, `ProductDetailPage` (stock ledger + history), `ProductForm` (incl. optional Sales Price), `RestockModal`, `InventoryView`; `useProducts.ts` hook.
- **Expenses** — `ExpensePage` (daily entry list, `(date,name)` upsert).
- **Settings** — `SettingsPage` (project owner + brokers management, invoice description rich-text editor, backup/restore) and hosts the **Adjustments** and **History** screens as modal pages.
- **Adjust / history** — `AdjustmentsPage` (recent payments + stock adjustments view, part of the ledger correction flow) and `HistoryPage` (audit log).
- **History** — `HistoryPage` reads the audit log.

## Shared renderer libs

- `api.ts` — IPC client (`window.api`, typed groups).
- `format.ts` — `formatMoney` ("Rs. 1,234.56"), `formatDate`, `formatDateTime`, `formatStockDate` ("2 AUG"), re-exports `localDate`.
- `money.ts` — `moneyToCents` (decimal string → integer minor units), `countToInt`.
- `sheet-format.ts` — print-specific formatting: `printDate` (DD-MM-YYYY), `printMoney` ("Rs." two decimals).
- `report.ts` — `buildCsv` (UTF-8 BOM, bracketed sections), `exportReportCsv`, and `printReport` (opens a standalone print-ready window).
- `selected-route.ts` — get/set persisted route in localStorage.
- `bulk-print.ts` — `prepareBulkPrintData` shared by the route bulk print and `LoadFormReport`.
- `load-form-print.ts` — pure pagination model: `planInvoicePages` (first invoice shares the load-form page; rest two-per-page), `groupIntoTwoUp`, `bulkPrintOrder`, `planBulkPrint`.

## Shared components

- `SearchSelect` — the app-wide combobox (search filter, ↑/↓+Enter+Esc keys, rendered via a portal so it opens above modals, flips upward when short on space). Replaces native `<select>`.
- `StatusBadge` — paid / partial / unpaid / cancelled colouring.
- `ErrorBoundary` — per-view crash shield with a reload affordance.
- `RouteShortcuts` — global Alt+Q / Alt+W fast paths (see Features).

## Forms & autofill

- Invoice lines snapshot product data (name, rate, min rate, pieces-per-carton) at entry time; the preview total comes from the same `calculateLineAmount` shared with main.
- The rate field autofills to the product's **Sales Price** when set, else its minimum rate — the user may override, but the floor (min rate) is enforced on submit.
- Money inputs parse decimals to integer paisa (`moneyToCents`) before they cross IPC.

## Printing flows

- **Single invoice**: `InvoiceSheet` renders on screen; the print CSS (`@media print` / `@page`) hides the app shell and prints exactly the sheet.
- **Load form (batch)**: `LoadFormReport` + the route bulk-print path render a hidden `.bulk-print` area; `body.bulk-printing` swaps the entire print job to it — load form + first invoice on page one, remaining invoices two-up on landscape A4.

## Keyboard shortcuts

`RouteShortcuts` listens globally (with guards against typing contexts, modals, and repeat keys) for:

- **Alt+Q** — create invoices for every customer on the route selected in the Customers screen (`MultipleInvoicesPage`).
- **Alt+W** — print today's load form + invoices for the selected route.

Both prompt for confirmation, depend on a route being selected in the Customers tab, and are disabled while a multiple-invoices batch is open.