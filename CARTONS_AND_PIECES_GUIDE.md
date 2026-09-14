# Cartons & Pieces (Dual-Unit Quantities) — Complete Guide

## Mental Model

Every quantity in MZTraders is tracked in **two complementary forms**:

| Form | Meaning | Used for |
|---|---|---|
| **Total pieces** | Raw count of individual units | Stock levels, ledger math, inventory |
| **Composition** (`cartonCount` + `boxCount`) | How those pieces are split into whole cartons + loose pieces | Invoices, load forms, stock display |

The two are always linked by the product's **`piecesPerCarton` (pcp)**, a value virtually frozen at product creation:

```
totalPieces = cartons × piecesPerCarton + loosePieces
cartons     = floor(totalPieces / piecesPerCarton)
loosePieces = totalPieces mod piecesPerCarton
```

Key rule: **"canonical form"**. Any entry is normalized so loose pieces never silently form a full carton — overflow is always carried up (e.g. `0 ctn + 30 pcs` with pcp=12 becomes `2 ctn + 6 pcs`).

---

## 1. Database Layer

### Tables

**`products`** (`src/main/database/migrations/001_initial_schema.ts:55`)

```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  rate INTEGER NOT NULL DEFAULT 0,            -- floor rate per carton (minor units)
  piecesPerCarton INTEGER NOT NULL DEFAULT 1, -- RENAMED from boxesPerCarton by migration 009
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`invoice_items`** (`001_initial_schema.ts:93`) — every line stores a full snapshot so historical invoices never change even if product data changes:

```sql
CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoiceId INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  productId INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  productName TEXT NOT NULL,        -- name snapshot at sale time
  rate INTEGER NOT NULL,            -- rate actually billed per carton
  minRate INTEGER NOT NULL,         -- product floor rate snapshot
  piecesPerCarton INTEGER NOT NULL, -- pcp snapshot
  cartonCount INTEGER NOT NULL,     -- canonical whole cartons
  boxCount INTEGER NOT NULL,        -- canonical loose pieces
  amount INTEGER NOT NULL,          -- precomputed line total
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`stock_movements`** (`002_future_extension_points.ts:32`) — append-only ledger, each row records the post-mutation balance:

```sql
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('opening','sale','purchase','adjustment','damage','return','other')),
  quantity INTEGER NOT NULL,          -- signed delta
  previousQuantity INTEGER, -- balance before
  newQuantity INTEGER,      -- balance after (total pieces)
  referenceType TEXT, -- e.g. 'invoice'
  referenceId INTEGER,    -- invoice id
  note TEXT, createdAt TEXT, date TEXT, price INTEGER
);
```

### Migration 009 — the pivotal one

`src/main/database/migrations/009_dual_unit_stock.ts` does three things:

1. `ALTER TABLE ... RENAME COLUMN boxesPerCarton TO piecesPerCarton` on `products` and `invoice_items` (SQLite 3.25+).
2. Adds `newCartons INTEGER` and `newLoosePieces INTEGER` to `stock_movements`.
3. **Backfills** every historical movement's `newCartons`/`newLoosePieces` from its `newQuantity` and the product's pcp via integer division.

Migrations run in order at app startup (`src/main/database/connection.ts:15`, `migrate.ts:35`).

### A snapshot of "after" columns

| Table | Column | Notes |
|---|---|---|
| `products` | `piecesPerCarton` | default 1; best kept immutable once stock history exists |
| `invoice_items` | `cartonCount`, `boxCount` | canonical at write time |
| `stock_movements` | `newCartons`, `newLoosePieces` | running balance in dual units |

---

## 2. The Shared Calculation Core (pure functions, no I/O)

### `calculateLineAmount` — `src/shared/calc/invoice-totals.ts:28`

This is **the single pricing formula** used for every invoice line:

```ts
export function calculateLineAmount({ rate, piecesPerCarton, cartonCount, boxCount }): number {
  const rateMinor = Math.max(0, int(rate))
  const bpc = Math.max(1, int(piecesPerCarton))
  const cartons = Math.max(0, int(cartonCount))
  const boxes = Math.max(0, int(boxCount))
  const cartonsAmount = rateMinor * cartons                    // full-rate exactly
  const boxesAmount = Math.round((rateMinor * boxes) / bpc)   // per-piece rate, rounded once
  return roundToTen(cartonsAmount + boxesAmount)
}
```

- Cartons bill at the full `rate` (rate is *per carton*).
- Loose pieces bill at `rate × pieces / pcp` (i.e. per-piece rate), rounded to the nearest integer minor unit.
- The sum is then snapped to the nearest **10 minor units** (paisa) by `roundToTen` — 5 rounds down, 6 rounds up. `calculateInvoiceSubtotal` simply reduces lines through `calculateLineAmount`.

### `canonicalComposition` — `src/shared/stock/stock-breakdown.ts:11`

```ts
export function canonicalComposition(pieces: number, piecesPerCarton: number) {
  const pcp = Math.max(1, piecesPerCarton)
  const sign = pieces < 0 ? -1 : 1
  const abs = Math.abs(pieces)
  return { cartons: sign * Math.floor(abs / pcp), loosePieces: sign * (abs % pcp) }
}
```

Handles negatives (sales deductions preserve sign on both components). This function is the *single source of truth* for turning total pieces into a canonical `ctn + pcs` split.

Its companions in the same file:
- **`deductStock(currentComp, neededPieces, pcp)`** — converts current to pieces, checks sufficiency, subtracts, recomposes canonically; throws if insufficient.
- **`addStock(currentComp, pieces, pcp)`** — adds and recomposes canonically.
- **`assertSufficientStock(...)`** — throws `available X ctn + Y pcs (Z pcs), requested N pcs` on shortage.

---

## 3. Backend Layer

### `InvoiceService.buildItems` — `src/main/services/invoice.service.ts:248`

The normalization gateway. Per line it:

1. **Validates product** exists (`productRepo.findById`).
2. **Validates rate** — integer, `>= 0`, and `>= product.rate` (floor), else throws.
3. **Two input paths** — the DTO now accepts either:
   - **Dual path** (primary): `cartonCount` / `boxCount` — both optional, default 0, must be non-negative integers; line must total ≥ 1; computes `pieces = cartons × pcp + boxes`.
   - **Legacy path**: `quantity` (total pieces), must be integer ≥ 1 — kept so old tests/e2e pass unchanged.
4. **Auto-converts to canonical form**: `canonicalComposition(pieces, pcp)` (this is where overflow pieces become cartons).
5. **Computes amount** via `calculateLineAmount` using the canonical counts.
6. **Stores a full snapshot row** (`productName`, `minRate`, `piecesPerCarton`, `cartonCount`, `boxCount`, `amount`).

### Stock checks & ledger — `invoice.service.ts:326`, `stock.service.ts`

- `assertSufficientStock`: converts each line back to pieces, aggregates per product, compares to `stockService.currentQuantity`.
- On create, `stockService.recordSalesForInvoice` (`stock.service.ts:168`) deducts total pieces via `deductStock`, inserts a `type:'sale'` movement with `newQuantity` **and** canonical `newCartons`/`newLoosePieces`, and logs an action summary.
- Moving the other direction are `restock` (`quantity`=cartons + `loosePieces` → `addStock`) and `adjust` (strict exact cartons/loose, → `deductStock`/`addStock`). `revertSalesForInvoice` uses `addStock` with reversed numbers and records `type:'return'`.

### `ProductService` guard

`update()` blocks changing `piecesPerCarton` once the product has any `stock_movements` (`product.service.ts:71`). **Never** changes a product's pcp after stock history exists — it silently corrupts every stored split.

### Handles low-level storage — `invoice.repository.ts`

- `InvoiceItemRow` mirrors the snapshot columns.
- INSERT writes all 9 columns; the **subtotal is recomputed server-side** from the canonical rows via `calculateInvoiceSubtotal`, so money always agrees with stored counts.
- `getItems` selects the full row, so `cartonCount`/`boxCount` flow back intact to UI/prints.

---

## 4. IPC / Preload / Type Bridge

- `src/main/ipc/invoice.ipc.ts:17` — `ipcMain.handle('invoices:create', (_, data: CreateInvoiceDTO) => …)`.
- `src/main/ipc/stock.ipc.ts` — `'stock:restock'`, `'stock:adjust'`, `'stock:levels'`.
- `src/preload/index.ts` — whitelist bridge exposing `window.api`.
- `src/renderer/src/lib/api.ts:92` — `api.invoices.create`, `api.stock.levels` etc.

**DTO contracts** (`src/shared/types/invoice.ts:63`, `src/shared/types/stock.ts:38`):

```ts
interface CreateInvoiceItemDTO {
  productId: number
  rate: number
  cartonCount?: number   // dual path
  boxCount?: number      // dual path
  quantity?: number      // legacy fallback
}
interface CreateRestockDTO { productId: number; quantity: number; loosePieces?: number } // quantity = cartons
interface AdjustStockDTO  { productId: number; cartons: number; loosePieces?: number; remove: boolean; note?: string | null }
interface StockLevel { productId: number; productName: string; quantity: number; cartons: number; loosePieces: number }
```

---

## 5. Frontend — Invoice Form

### Values shape (`InvoiceForm.tsx:12`)

```ts
interface InvoiceFormValues {
  customerId, brokerId, filerStatus, tax: string
  items: Array<{ productId: number | null; rate: string; cartons: string; pieces: string }>
}
```

Note the naming asymmetry: form uses **`cartons`/`pieces`** (strings), DTO uses **`cartonCount`/`boxCount`** (numbers).

### Submission mapping (`InvoiceFormPage.tsx:56`)

```ts
items: values.items.map(l => ({
  productId: l.productId!,
  rate: moneyToCents(l.rate),
  cartonCount: Number(l.cartons) || 0,
  boxCount: Number(l.pieces) || 0,
}))
```

### Parsing — `src/renderer/src/lib/money.ts`

- `moneyToCents` — "100.50" → 10050.
- `countToInt` — count strings → non-negative int, empty/invalid → 0. This is *why* auto-conversion handles empty carton/pieces fields gracefully.

### Live preview & validation

- **subtotal / lineAmount** (`InvoiceForm.tsx:96`, `:179`): total pieces = `countToInt(cartons) × pcp + countToInt(pieces)` → `canonicalComposition` → `calculateLineAmount`. The UI and the backend therefore compute identically.
- **lineError** (`:195`): rate floor → `Enter cartons or pieces` when both empty → stock check `pcs > stock → Only N pcs in stock — requested M pcs`.
- **Auto-convert hint** (line ~396): under each line it shows `In stock: 84 pcs (7 ctn + 0 pcs)` plus the canonical breakdown of your input, flagging `(pieces auto-converted to cartons)` when `pieces >= pcp`.
- **Keyboard flow**: Product → Rate (**Enter**) → Cartons (**Enter**) → Pieces (**Enter**) → next line's product (refs: `productRefs`, `rateRefs`, `cartonRefs`, `qtyRefs`).

---

## 6. Display / Print Features

### InvoiceSheet — `InvoiceSheet.tsx:62`

Line table shows columns `Products | Rate | Cartons | Pcs | Scheme | Amount`, printing `item.cartonCount` and `item.boxCount` straight from the DB (already canonical). Footer sums them: `Total Ctn (Cartons)` and `Total Pcs`.

### Load Form — `LoadFormSheet.tsx:36` + `invoice.service.ts:230`

Product rows show `Cartons | Pcs | Total qty`. The load form **aggregates across selected invoices** and re-canonicalizes the sum:

```ts
const composition = canonicalComposition(line.totalQuantity, piecesPerCarton)
return { ...line, cartonCount: composition.cartons, boxCount: composition.loosePieces }
```

So 29 pieces across two invoices always print `2 ctn + 5 pcs`.

### Stock display dots everywhere (naming/format living in several places)

- Product detail / print, restock modal, adjustments page, dashboard all show `X ctn + Y pcs (Z pcs)`.
- Dashboard sums `Math.floor(remaining/bpc)` and `remaining % bpc` across products.
- **Gotcha**: there's a local `splitUnits` helper in `ProductDetailPage.tsx:13` duplicating `canonicalComposition`, and the `StockLevel.cartons/loosePieces` reported by the API is frequently ignored in favor of re-deriving from `quantity`. Not a bug (both are canonical), but a consolidation opportunity.

---

## 7. Money Rules You Must Reuse

- **Rate = per carton**, in minor units (paisa/cents), integer only.
- **Pieces bill at `rate × pcp` per unit**, not at rate themselves.
- `roundToTen` snaps every money figure to a multiple of 10 (5 → down, 6 → up).
- **Profit** (`dashboard.service.ts:31`) uses the same formula minus `roundToTen`: `amount − (minRate × cartons + round(minRate × boxes / pcp))`.

---

## 8. Tests

- `tests/unit/invoice-totals.test.ts` — core formula: `{rate:10000, pcp:12, cartons:3, boxCount:6}` → 35000; box-only 17 → 14170 (round-to-ten).
- `tests/unit/stock.service.test.ts` — `restock({quantity:0, loosePieces:7})` → 7 pcs; `restock({quantity:2, loosePieces:5})` → 29; sale movement `−29`, `previousQuantity 84 → 55`.
- `tests/unit/invoice.service.test.ts` — load form combines 24+5 → `cartonCount 2, boxCount 5`.
- `tests/unit/migrations.test.ts` — asserts the renamed/added columns.
- **Gap**: no dedicated test file for `stock-breakdown.ts` (canonicalComposition/deductStock/addStock/assertSufficientStock) — only covered indirectly. Worth adding if you touch this logic.

---

## Top Things to Remember

1. **Always store/write canonical counts** — the backend re-normalizes via `canonicalComposition` no matter what arrives.
2. **`piecesPerCarton` is immutable once a product has movements** — changing it orphans every historical split.
3. **Forward-compatible, backward-safe**: the DTO keeps both the dual path (`cartonCount`/`boxCount`) and the legacy `quantity` path, so old callers still work.
4. **Never hand-roll the split** — use `canonicalComposition` (not copy-pasted `Math.floor`/`%`, and not `ProductDetailPage`'s local `splitUnits`), and never hand-roll amount — use `calculateLineAmount`.