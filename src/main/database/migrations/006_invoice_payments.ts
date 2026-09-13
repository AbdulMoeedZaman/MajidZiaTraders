import type { AppDatabase } from '../sqlite'

// Invoice payment tracking:
//  - `status`      : Paid / Unpaid / Partially Paid / Cancelled. Derived by the payment
//                    service whenever a payment is recorded or an invoice is cancelled,
//                    then stored so lists, dashboards and the print sheet never recompute.
//  - `paidAmount`  : total recorded payments in minor units (whole paisa). The remaining
//                    balance of an invoice is `(grandTotal ?? subtotal) - paidAmount`.
// Cancelling an invoice reverses its payments and restocks the products, then leaves
// the invoice in the ledger with status `cancelled` for history.

export function up(db: AppDatabase): void {
  db.exec(`
    ALTER TABLE invoices
      ADD COLUMN status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (status IN ('unpaid', 'paid', 'partial', 'cancelled'));
    ALTER TABLE invoices ADD COLUMN paidAmount INTEGER NOT NULL DEFAULT 0;
  `)
}