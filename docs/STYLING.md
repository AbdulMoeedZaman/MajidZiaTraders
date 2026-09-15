# Styling

Short summary of how MZTraders is styled. Single stylesheet, CSS variables for tokens, plus dedicated print layouts. See [DEEP.md](./DEEP.md) for the full context.

## One stylesheet

All styling lives in `src/renderer/src/styles/globals.css` (~2,500 lines), imported once in `src/renderer/src/main.tsx`. There are no CSS modules or framework classes — components use plain semantic class names.

## Design tokens

A small set of CSS custom properties on `:root` drives the whole UI:

```css
:root {
  --bg: #f4f6f9;          /* page background   */
  --surface: #ffffff;     /* cards, header     */
  --border: #e2e6ec;      /* hairlines         */
  --text: #1f2933;        /* primary text      */
  --text-muted: #6b7280;  /* secondary text    */
  --primary: #2563eb;     /* accents, nav item */
  --primary-hover: #1d4ed8;
  --danger: #dc2626;      /* destructive       */
  --warn: #b45309;        /* warnings          */
  --ok: #15803d;          /* success / paid    */
  --radius: 8px;          /* consistent radii  */
  --shadow: 0 1px 3px rgba(16, 24, 40, 0.08);
}
```

- Font stack: the system font (`-apple-system`, Segoe UI, Roboto, …), 14px base, 1.45 line-height.
- Money figures use tabular numerals; text is left-aligned, numbers right-aligned.

## Layout

- `.app-shell` is a CSS grid: a fixed **230px** `.sidebar` plus a flexible `.app-main` column, filling `100vh`.
- `.sidebar` (dark `#111827`) contains the brand, the `.sidebar-nav` column of `.nav-item` buttons and a `.sidebar-footer`. The active nav item is filled with `--primary`.
- `.app-main` is a column: `.header` (surface background, bottom border, page title and back button) above a scrollable `.content` area (`padding: 24px`).
- Every feature is a `.feature` block (cards with heading row + action buttons + tables).

## Components

Shared building blocks and their classes:

- **Modal**: `.overlay` (fixed full-screen scrim) → `.modal` (`--radius`, `--shadow`) with `.modal-header`, `.modal-actions`. Full-page variants use `.modal-page` so a print-sheet lives inside the normal layout instead of a popup.
- **Tables**: plain `.table`-style rows with right-aligned numeric columns; statuses rendered with `.status-badge` coloring (`paid`/`ok`, `partial`/`warn`, `unpaid` grey, `cancelled` muted).
- **Buttons**: primary, secondary and danger button classes; the header back link uses `.back`.
- **Forms**: stacked label + input rows with consistent spacing; money inputs show the "Rs." prefix; the invoice form uses a `.item-row` grid with per-line remove buttons and a `.totals` strip.

## Printed output

Printing is a first-class feature, so the stylesheet contains several print-specific blocks:

- `@media print` / `@page` rules for the on-screen **invoice sheet** (`.invoice-sheet`, `.sheet-head`, `.ip-*` classes) — the browser's print dialog prints exactly the sheet, hiding the surrounding app.
- The **load-form bulk print**: a hidden `.bulk-print` container (invisible on screen) becomes the entire print job. `body.bulk-printing #root` and `.app-shell` are hidden; the print shows one `.print-page` per physical page and lays the load form and the first invoice side by side on page one, then remaining invoices two-up (`.two-up` / `.two-col`) on landscape A4 pages.
- Utility classes such as `.print-only` make meta blocks visible only when printing.

## Light theme only

The app currently ships a single light theme defined by the tokens above; there is no dark mode or theme switching.