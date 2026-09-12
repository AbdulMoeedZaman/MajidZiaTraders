# Sample data for testing

`mztraders-sample.db` is a ready-made MZTraders database you can load into the app
to try things out. It is produced by `npm run sample-data` (seed source:
`tests/unit/sample-data.test.ts`).

## What's inside

- **8 products** (BAS-001 Basmati Rice 5kg, SUG-001 White Sugar 1kg, OIL-001 Cooking Oil 5L,
  TEA-001 Black Tea 250g, SPL-001 Washing Soap, FLR-001 Wheat Flour 10kg, GHE-001 Desi Ghee 1kg,
  BIS-001 Assorted Biscuits) — prices in paisa, e.g. 32000 = **Rs. 320.00**.
- **5 customers** with addresses.
- **2 restocks**:
  - a direct stock-in from Habib Oil Mills (cooking oil, cost basis → Rs. 245.00),
  - a purchase order from Punjab Sugar Mills that was marked received (sugar cost basis → Rs. 160.00).
- **7 invoices** (INV-000001…INV-000007) covering the everyday situations:
  - a large unpaid invoice with a Rs. 20.00 discount,
  - a partially paid invoice,
  - a fully paid invoice (bank transfer),
  - an **overdue** invoice (due date passed),
  - a cancelled invoice whose stock was given back,
  - an unpaid invoice plus a **customer credit / advance payment** that was auto-applied
    to another open invoice.
- **3 payments**, including one without an invoice (advance credit).
- **1 stock adjustment** (damage −5 soaps).
- Opening stock on every product, so stock reports, the dashboard and the inventory report
  all have something to show.

The seed test also verifies the data is internally consistent (stock quantities, customer
balances, invoice overdue status and the sales profit all match their expected values).

## How to load it

1. Open MZTraders → **Settings → Backup & Restore**.
2. Click **Restore from backup** and pick `sample-data/mztraders-sample.db`.
   (Your current data is kept safe in an automatic "before-restore" backup.)
3. The sample invoices are dated within the last week of the day you ran the seed,
   so reports and the dashboard will show meaningful numbers.

## How to regenerate

```bash
npm run sample-data
```

Regenerate whenever you want a fresh dataset (e.g. after migrating the schema).
The generated file is deleted first, so it never mixes old and new data.