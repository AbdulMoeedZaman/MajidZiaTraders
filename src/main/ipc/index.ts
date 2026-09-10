import { registerProductIpc } from './product.ipc'
import { registerCategoryIpc } from './category.ipc'
import { registerInventoryIpc } from './inventory.ipc'
import { registerCustomerIpc } from './customer.ipc'
import { registerCustomerLedgerIpc } from './customer-ledger.ipc'
import { registerPaymentIpc } from './payment.ipc'
import { registerInvoiceIpc } from './invoice.ipc'
import { registerRestockIpc } from './restock.ipc'
import { registerBusinessProfileIpc } from './business-profile.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerReportIpc } from './report.ipc'
import { registerCsvIpc } from './csv.ipc'
import { registerDashboardIpc } from './dashboard.ipc'
import { registerBackupIpc } from './backup.ipc'
import { registerDialogIpc } from './dialog.ipc'

export function registerAllIpc(): void {
  registerProductIpc()
  registerCategoryIpc()
  registerInventoryIpc()
  registerCustomerIpc()
  registerCustomerLedgerIpc()
  registerPaymentIpc()
  registerInvoiceIpc()
  registerRestockIpc()
  registerBusinessProfileIpc()
  registerSettingsIpc()
  registerReportIpc()
  registerCsvIpc()
  registerDashboardIpc()
  registerBackupIpc()
  registerDialogIpc()
}
