# Features & Functionality

Short feature-by-feature map of MZTraders (a parts-sales invoicing app for a trader who delivers on fixed routes). See [DEEP.md](./DEEP.md) for how the pieces fit together.

## Core entities

- **Project Owner** — one or more owner profiles (name, phone, address). The owner's details print on invoices; an owner must exist before an invoice can be created.
- **Broker / Booker** — brokers who bring sales; every invoice is tagged with one.
- **Routes** — exactly six fixed delivery days: Mon, Tue, Wed, Thu, Sat, Sun (Friday has no route). The day is immutable; the user can rename each route's display name. Each customer belongs to one route.
- **Products** — name, **minimum rate per carton**, optional **Sales Price** (autofills new invoice lines; falls back to the minimum rate otherwise), and **pieces per carton**.
- **Customers** — unique code, shop name, owner name, phone, address, assigned route, optional owner association.

## Invoicing

- Create an invoice for a customer: pick customer, broker, date, filer status (filer / non-filer), then add product lines.
- Each line stores **cartons + loose pieces** plus the rate; the system canonicalises every line into whole cartons + leftover pieces.
- The rate autofills from the product's Sales Price (or its minimum rate), and the **minimum-rate floor is enforced**.
- Totals are system-calculated and rounded to the nearest ten paisa: subtotal = sum of line amounts, grand total = subtotal + (optional) tax. Amounts use integer minor units throughout.
- **Stock check**: creating an invoice fails if it would drive any product below zero stock; purchase movements already recorded are balanced against the ledger.
- Invoice numbering is sequential (`INV-000001`…) via a settings counter, generated inside the same transaction.
- **Multiple invoices**: from the Customers screen, select a route and create invoices for every customer on it in one go (this is what Alt+Q triggers).
- View invoice details, **print** a single invoice sheet, or **bulk-print a load form** with the invoices.
- **Delete** an invoice (only when no payments were recorded; removes its stock movements) or **cancel** it (reverses payments, restocks product with `return` movements, keeps the invoice as `cancelled` for history).

## Load forms (delivery sheet)

- Select a set of invoices and build/print a **load form**: one aggregate per product (combined cartons + loose pieces) and per customer (summed amounts), plus the grand total.
- The bulk print runs load form + first invoice on page one, then remaining invoices two per landscape A4 page.
- Cancelled invoices are refused on a load form.

## Stock & inventory

- **Restock** a product by whole cartons + loose pieces → a `purchase` ledger movement.
- **Adjust** stock up or down with a free-text note (`adjustment` movement); removing more than available is blocked.
- Every gain/loss is an **append-only ledger** (`stock_movements`) recording previous/new balance as pieces and as cartons + loose pieces, with the causing invoice and a price snapshot for sales.
- Current stock of a product is always the **last ledger row's running balance** — no separate "on hand" column to keep in sync.
- **Inventory view** shows the whole ledger with export/print (CSV / print window).

## Payments & outstanding

- Pay an **invoice** individually.
- Pay a **customer** in one go — the amount is applied across their open invoices **oldest first**, rolling surplus to the next (surplus above the total owed is rejected).
- Invoice status is derived and stored: `paid` / `partial` / `unpaid` / `cancelled`.
- **Reverse a mistaken payment** (adjustments tab) — the invoice's paid amount and status are recomputed from the remaining payments.
- Dashboard shows open balances (`owed`) per customer and across all invoices.

## Expenses

- Daily expenses by name and amount; `(date, name)` is unique so re-saving the same expense on the same day updates its price instead of duplicating.
- Day-level and date-range summaries feed the Dashboard's cash-flow outward figure.

## Dashboard

Date-range driven summary:
- **Profit** per customer and total = billed amount minus the **minimum-rate cost basis** of the sold product lines.
- **Stock** remaining per product (with value at its rate) and total stock value.
- Invoices in range, plus **today's dispatches** (units sold today from the sale ledger).
- Expenses: today's total and the range total grouped by day.
- **Owed**: open balances per customer. **Cash flow**: payments received vs expenses paid in range.
- Recent products / invoices / customers. Modals support CSV export and printing.

## Settings

- Edit the **project owner**, manage **brokers**.
- **Backup**: create a backup file, validate an existing one, and restore (with an automatic safety copy of the current database before a restore).
- Invoice description (rich text) used on printed invoices; invoice number counter.
- Hosts the **Adjustments** and **History** screens (ledger corrections and the audit log).

## Audit log (History)

An append-only log records every meaningful action: `product_created`, `restocked`, `payment_recorded`, `payment_reversed`, `stock_adjusted`, `invoice_created` — with a summary and a JSON snapshot, written inside the same transaction as the action itself.

## Adjustments screen

Two tabs:
- **Stock Adjustments** — manual add/remove of cartons + loose pieces with a note.
- **Payment Adjustments** — recent payments with customer/invoice context and the ability to remove a payment.

## Keyboard shortcuts

- **Alt+Q** — open "multiple invoices" for the route selected on the Customers screen (guarded against typing contexts, open modals, repeat keys, and an in-progress batch; asks for confirmation).
- **Alt+W** — print the load form + invoices for the selected route (same guards).

Both act on the **persisted selected route** (saved in localStorage from the Customers tab).

## Imports

- On the **Customers** screen: import customers from an **Excel** listing, assigned to the route tab you are on.
- On the **Products** screen: import products from a **CSV** file.
- Both skip duplicate/invalid rows and report created/skipped counts.

## Sample data

- `npm run sample-data` regenerates `sample-data/mztraders-sample.db` for exploring the app.
- E2E suites exercise the full renderer → preload → IPC → SQLite path with isolated user-data folders.