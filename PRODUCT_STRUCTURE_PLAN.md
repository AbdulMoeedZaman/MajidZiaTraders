# Plan — Product & Restock (Purchase) Structure Redesign

**What this is:** an implementation plan to rebuild the *product* and *restock (purchase-in)* data model so it matches how goods are actually received, based on a real supplier sales-tax invoice (`sales_tax_invoice_complete.csv`, 13-line EBM-style biscuit distributor invoice to M.Z Trader). The **customer invoice and payment side is explicitly out of scope** and must not change in behaviour — only the *product* structure that both sides read from changes, and it must be fixed everywhere it's used.

**Status:** planning only, nothing implemented yet. Section 12 lists decisions that need your confirmation before coding starts.

---

## 1. What the source CSV actually is

It's a **supplier's sales-tax invoice to us** (a purchase document) — i.e. it maps 1:1 onto the app's existing `Restock` concept, not onto `Invoice`. "TO: M.Z Trader - Tanda" is *us*, the buyer.

### 1.1 Header block → restock header fields

| CSV field | Meaning | Maps to |
|---|---|---|
| TO / Address Line 1/2 / Phone | Our own (buyer) name/address/phone as printed on their invoice | snapshot only, low value — see §12 Q1 |
| National Tax No. | Ambiguous — likely our NTN as recorded with this supplier | new `restocks.buyerNtn` (nullable) |
| SALES TAX INV # | **Supplier's own invoice number** (not ours) | new `restocks.supplierInvoiceNo` |
| BILLING DATE | Invoice date | already `restocks.date` ✅ |
| REGISTRATION NO | Supplier's Sales Tax Registration No. (STRN) | new `restocks.supplierRegistrationNo` |
| CNIC#/NTN | Our CNIC/NTN as printed | new `restocks.buyerCnic` |
| DISPATCH NOTE NO. | Delivery/dispatch reference | new `restocks.dispatchNoteNo` |
| SALES ORDER NO. | Supplier's sales-order reference | new `restocks.salesOrderNo` |

These aren't cosmetic — `SALES TAX INV #`, `REGISTRATION NO`, and the date/amounts are exactly what's needed to reconcile input sales tax against a supplier in an FBR sales-tax return (Annex-A style matching). Right now `restocks` captures none of this.

### 1.2 Line items → restock item fields, and the formulas that tie them together

Each description encodes real product structure that today's schema throws away:

> `Bakeri Butter SP 33g 6x24 Rs.50`
> = brand/name `Bakeri Butter`, pack type `SP`, piece weight `33g`, **pack config `6×24`** (6 inner packs of 24 → **144 pieces/carton**), MRP `Rs.50`/piece.

I reverse-engineered the numeric columns against all 13 rows and they reconcile **exactly** (to the paisa) with these formulas:

```
retailPricePerCarton      = (piecesPerCarton × mrpPerPiece) / (1 + salesTaxRate)      ← Sales Tax is charged on statutory retail value, NOT trade price
totalRetailValueExcl      = qtyCartons × retailPricePerCarton
salesTaxAmount             = totalRetailValueExcl × salesTaxRate                        (18% here)
advanceTax                 = netSalesValueExcl × 0.001                                  (0.1% — Pakistan's standard advance tax on distributor sales)
discountedValueInclusive   = netSalesValueExcl + salesTaxAmount + advanceTax − tradeDiscountValue
```

Verified against all 13 rows, e.g. row 1: `16580.3 + 3661.02 + 16.58 − 0 = 20257.9` ✅ exact match.

The one figure that **cannot** be derived — `netSalesValueExcl` (the real trade/cost price we're actually charged) — must always come from the supplier's invoice as entered/imported data, never computed. Everything else can be auto-computed with the formulas above but must remain **editable**, so a line can be made to match the physical invoice to the paisa when the formulas don't quite land (rounding on their side).

This confirms the existing `products.piecesPerCarton` column already has the right *name* for the concept we need — it's just never used anywhere in the calculation code today.

---

## 2. Scope

**In scope**
- `Product` structure: pack size, MRP, piecesPerCarton wired into real conversions, purchase-unit (carton) vs. stock-unit (piece).
- `Restock` (purchase) header + line items: full tax/discount structure from §1.
- Stock-movement conversion logic (cartons in → pieces tracked).
- Every screen/report that reads `Product` fields, so the new fields show up consistently (Product form/detail, Restock form/detail, dashboards, CSV export).

**Out of scope — must not change behaviourally**
- `Invoice` / `InvoiceItem` schema, tax calc (`calculateInvoiceTotals`), discount logic, stock-decrement-on-sale logic.
- `CustomerPayment`, `payment_allocations`, `customer_ledger` logic.
- The invoice/payment UI forms, beyond the product-field changes flowing through automatically (e.g. an updated unit label). No new tax fields, no per-line tax, no advance tax on the sales side — you were explicit that the customer side stays as-is.

---

## 3. Current state (for reference — full detail already gathered)

- `products`: `sku, name, description, categoryId, unit (free text, default 'piece'), piecesPerCarton (int, default 1, UNUSED), baseCostPrice, minSellingPrice, sellingPrice, reorderLevel, isActive`.
- `restocks`: `referenceNumber, supplierName (free text), date, totalCost, status, notes`. **Zero tax/discount fields.**
- `restock_items`: `restockId, productId, unit (free text), quantity, unitCost, totalCost`. One quantity, one cost — no cartons, no tax, no discount.
- `stock_movements`: single undimensioned integer `quantity` — no unit. Stock is always derived from the latest movement row.
- `RestockService.markReceived()` posts `quantity` (as entered) straight into `stock_movements` — no carton→piece conversion happens anywhere.

---

## 4. Target data model

### 4.1 `products` — add pack/purchase structure

```sql
ALTER TABLE products ADD COLUMN packSize TEXT;           -- e.g. "33g" (display only)
ALTER TABLE products ADD COLUMN packConfig TEXT;          -- e.g. "6x24" (display only, informs piecesPerCarton)
ALTER TABLE products ADD COLUMN mrp INTEGER;               -- printed retail price per piece, integer cents, nullable
ALTER TABLE products ADD COLUMN purchaseUnit TEXT NOT NULL DEFAULT 'carton';
-- `unit` (existing) keeps meaning "stock/sale unit", default stays 'piece'.
-- `piecesPerCarton` (existing) becomes the live conversion factor: purchaseUnit → unit.
```

`baseCostPrice` stays **per stock unit (piece)** — no new per-carton cost column on `products`. After each `markReceived()`, it's recomputed from the restock line: `netSalesValueExcl / (qtyCartons × piecesPerCarton)`.

### 4.2 `restocks` — supplier-invoice header fields

```sql
ALTER TABLE restocks ADD COLUMN supplierInvoiceNo TEXT;
ALTER TABLE restocks ADD COLUMN supplierRegistrationNo TEXT;
ALTER TABLE restocks ADD COLUMN buyerNtn TEXT;
ALTER TABLE restocks ADD COLUMN buyerCnic TEXT;
ALTER TABLE restocks ADD COLUMN dispatchNoteNo TEXT;
ALTER TABLE restocks ADD COLUMN salesOrderNo TEXT;
-- aggregate totals, mirroring how `invoices` already stores subtotal/tax/total:
ALTER TABLE restocks ADD COLUMN totalRetailValueExcl INTEGER NOT NULL DEFAULT 0;
ALTER TABLE restocks ADD COLUMN totalSalesTax INTEGER NOT NULL DEFAULT 0;
ALTER TABLE restocks ADD COLUMN totalAdvanceTax INTEGER NOT NULL DEFAULT 0;
ALTER TABLE restocks ADD COLUMN totalTradeDiscount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE restocks ADD COLUMN totalNetValueExcl INTEGER NOT NULL DEFAULT 0;
-- `totalCost` (existing) keeps its name but its meaning becomes the grand total payable
-- (= totalNetValueExcl + totalSalesTax + totalAdvanceTax - totalTradeDiscount), i.e. what
-- "Discounted Sales Value Inclusive of Sales Tax" sums to. See §12 Q2.
```

`supplierName` stays free text for now (see §12 Q3 on whether to promote it to a `suppliers` table).

### 4.3 `restock_items` — rebuilt (SQLite: create-new/copy/drop/rename, same pattern 004 already used)

```sql
CREATE TABLE restock_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restockId INTEGER NOT NULL REFERENCES restocks(id) ON DELETE CASCADE,
  productId INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qtyCartons INTEGER NOT NULL,                    -- was `quantity` + free-text `unit`
  piecesPerCarton INTEGER NOT NULL,               -- snapshot from product at entry time
  mrpPerPiece INTEGER,                             -- snapshot, nullable
  salesTaxRate INTEGER NOT NULL DEFAULT 1800,      -- basis points (18.00% = 1800), per-line not header-level
  retailPricePerCarton INTEGER NOT NULL DEFAULT 0,
  totalRetailValueExcl INTEGER NOT NULL DEFAULT 0,
  salesTaxAmount INTEGER NOT NULL DEFAULT 0,
  advanceTaxRate INTEGER NOT NULL DEFAULT 10,      -- basis points (0.10% = 10)
  advanceTax INTEGER NOT NULL DEFAULT 0,
  netSalesValueExcl INTEGER NOT NULL DEFAULT 0,     -- the one authoritative, non-derived figure
  tradeDiscountValue INTEGER NOT NULL DEFAULT 0,
  discountedValueInclusive INTEGER NOT NULL DEFAULT 0,  -- line total payable
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`unitCost`/`totalCost` are dropped in favour of the explicit columns above; `unitCost` (cost per stock unit) is derivable as `netSalesValueExcl / (qtyCartons × piecesPerCarton)` when needed rather than stored redundantly.

### 4.4 Stock-movement conversion (service logic, no schema change to `stock_movements`)

`RestockService.markReceived()` changes from posting `item.quantity` directly to posting `item.qtyCartons × item.piecesPerCarton` pieces per line. `stock_movements` keeps tracking pure piece counts — no unit dimension needed there, since "1 stock unit = 1 piece" stays a fixed invariant everywhere else in the app (inventory, invoices, reports).

### 4.5 (Optional, Phase 2) `suppliers` table

```sql
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  registrationNo TEXT,     -- STRN
  ntn TEXT,
  phone TEXT,
  address TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
-- restocks.supplierName → restocks.supplierId REFERENCES suppliers(id), backfilled by
-- de-duping existing supplierName values into new supplier rows.
```
See §12 Q3 — recommended, but separable from the core product/restock fix.

---

## 5. Migration

New file `src/main/database/migrations/006_product_purchase_structure.ts`, registered in `migrate.ts`. Rules already established by this project (don't break them): never edit 001–005; write pure additive/rebuild SQL; wrap in a transaction; preserve existing data (existing `restock_items` rows get `qtyCartons = quantity`, `piecesPerCarton = 1`, `netSalesValueExcl = totalCost`, `discountedValueInclusive = totalCost`, everything else 0 — a clearly-flagged best-effort backfill, not a real reconstruction, since the old rows never captured tax).

---

## 6. Shared types (`src/shared/types/`)

- `product.ts`: add `packSize`, `packConfig`, `mrp`, `purchaseUnit` to `Product`, `CreateProductDTO`, `UpdateProductDTO`.
- `restock.ts`: add header fields to `Restock`; replace `RestockItem`/`CreateRestockItemDTO` fields per §4.3; add a `src/shared/calc/restock-totals.ts` (mirroring `invoice-totals.ts`) implementing the §1.2 formulas as pure functions shared by main and renderer, so the form's live preview and the service's persisted numbers can never disagree — the exact bug class C1/C2 in `FIX_PROMPT.md` warns about.

## 7. Service/repository layer

- `ProductService`: validate `piecesPerCarton >= 1` (already does), add `mrp >= 0` check; no other business-rule changes.
- `RestockRepository.create/update`: extended column list for header + items.
- `RestockService.create()`: compute per-line values via `restock-totals.ts`, aggregate into header totals, still requires ≥1 item, still generates `referenceNumber` — unchanged flow otherwise.
- `RestockService.markReceived()`: **the key behavioural change** — convert `qtyCartons × piecesPerCarton` before calling `InventoryRepository.create()`; update `product.baseCostPrice` from `netSalesValueExcl / (qtyCartons × piecesPerCarton)` instead of the old flat `unitCost`.
- `InvoiceService`, `PaymentService`, ledger code: **no changes.**

## 8. IPC

No new channels needed — `products:create/update`, `restocks:create/update` already take DTO objects; the DTOs just grow more fields. Verify `csv:*` handlers (not yet inspected) don't hardcode the old `restock_items`/`products` column list — check `src/main/ipc` and any CSV export/import code for stale field references once the schema lands.

## 9. UI

- **`ProductForm.tsx`**: add Pack size, Pack config (e.g. "6x24"), MRP fields; relabel "Pieces per carton" as computed-from-pack-config-or-manual (keep manual override); no removal of existing fields.
- **`RestockForm.tsx`** — the biggest UI change: each line becomes Product → **Qty (cartons)** → MRP (prefilled from product, editable) → Sales tax % (prefilled 18%) → Advance tax % (prefilled 0.1%) → Trade discount → **Net Sales Value (the one field you must type from the physical invoice)**, with retail value/tax/discounted-total auto-computed live via `restock-totals.ts` and shown read-only-but-overridable. Header gains Supplier Invoice #, Registration No, Dispatch Note No, Sales Order No (all optional).
- **`RestockDetailPage.tsx`**: show the new header fields and the full per-line tax breakdown; printable view should look like the source document.
- **`ProductDetail.tsx`**: show pack config / MRP / piecesPerCarton conversion clearly (e.g. "1 carton = 48 pieces").
- **`InvoiceForm.tsx`**: **no calculation changes.** Only check whether it should let a line be sold "by carton" using the now-real `piecesPerCarton` conversion (currently `unit` is copied silently from the product and unused for conversion) — see §12 Q4, this is the one place the line between "product structure fix" and "invoice behaviour" gets blurry and needs your call.
- Dashboard/reports: check for any hardcoded reference to `restock_items.unitCost`/`quantity` and update.

## 10. (Optional, Phase 3) CSV import for restocks

You handed me an actual file in this exact format — worth a dedicated importer: parse the `--- INVOICE HEADER INFORMATION ---` / `--- INVOICE LINE ITEMS ---` blocks, match each line's `Description` against `products.packConfig`+`name` (or a new `supplierDescription` snapshot column) to find existing products, prompt to create new ones inline for unmatched descriptions, prefill every restock field from §4.3 automatically, land in the new `RestockForm` for review before saving. This turns "re-type 13 lines" into "drop the file, review, save." Flagged optional because it's new surface area beyond what you asked for directly, but it's the natural payoff of doing the schema work above.

---

## 11. What explicitly does not change

Invoice totals engine, discount logic, tax-rate-per-invoice model, stock-decrement-on-invoice-create, payment allocation, customer ledger, `InvoiceForm`/`PaymentForm` calculation behaviour — confirmed unchanged per your instruction.

---

## 12. Open decisions — need your call before I start

1. **Header snapshot fields (buyer name/address/phone as printed)** — store them on `restocks` for document fidelity, or skip since they just duplicate `business_profile`? *Recommend: skip — low value, adds columns for nothing acted on.*
2. **What does `restocks.totalCost` / `restock_items` cost feed into product costing** — the tax-exclusive net value, or the tax-inclusive amount actually paid? *Recommend: `baseCostPrice` is updated from `netSalesValueExcl` (tax-exclusive) since sales tax paid on purchase is normally a recoverable input-tax credit for a registered dealer, not a real product cost — but confirm this matches how you actually do accounting, since if you're not FBR-registered/claiming input tax, the inclusive figure is the right one.*
3. **Promote `supplierName` to a real `suppliers` table now (§4.5), or keep free text and defer?** *Recommend: defer to a fast-follow — it's valuable (STRN reuse, future CSV auto-matching) but not required to fix the product structure itself.*
4. **Should invoices be sellable "by carton"** now that `piecesPerCarton` actually works, or keep sales strictly per-piece and only fix the *purchase* side? *You said the customer/payment side stays the same — I'll interpret that as "keep invoices per-piece only" unless you tell me otherwise.*
5. **Advance tax rate (0.1%) and sales tax rate (18%)** — hardcode as defaults with per-line override (as modeled above), or make them configurable business-wide settings like `business_profile.taxRate` already is for invoices? *Recommend: per-line override with 18%/0.1% defaults, same pattern as the invoice tax rate today.*

---

## 13. Rollout order

1. Migration 006 + shared types + `restock-totals.ts` (with unit tests reproducing the §1.2 formulas against all 13 CSV rows).
2. Repository/service layer changes, `markReceived()` conversion logic.
3. `ProductForm` + `ProductDetail` UI.
4. `RestockForm` + `RestockDetailPage` UI (the large one).
5. Sweep for stale references (dashboard, reports, CSV export) to old `restock_items`/`products` fields.
6. `npm run typecheck`, `npm run build`, full manual pass creating a restock from the real CSV numbers and confirming stock lands in *pieces* correctly, product `baseCostPrice` updates correctly, and an invoice against that product still behaves exactly as before.
7. (Optional) Phase 2 suppliers table, Phase 3 CSV importer.
