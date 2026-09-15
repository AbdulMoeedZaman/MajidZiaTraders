import { registerProjectOwnerIpc } from './project-owner.ipc'
import { registerBrokerIpc } from './broker.ipc'
import { registerRouteIpc } from './route.ipc'
import { registerProductIpc } from './product.ipc'
import { registerDataTransferIpc } from './data-transfer.ipc'
import { registerStockIpc } from './stock.ipc'
import { registerCustomerIpc } from './customer.ipc'
import { registerProductPreferenceIpc } from './product-preference.ipc'
import { registerInvoiceIpc } from './invoice.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerBackupIpc } from './backup.ipc'
import { registerDashboardIpc } from './dashboard.ipc'
import { registerExpenseIpc } from './expense.ipc'
import { registerPaymentIpc } from './payment.ipc'
import { registerHistoryIpc } from './history.ipc'

export function registerAllIpc(): void {
  registerProjectOwnerIpc()
  registerBrokerIpc()
  registerRouteIpc()
  registerProductIpc()
  registerDataTransferIpc()
  registerStockIpc()
  registerCustomerIpc()
  registerProductPreferenceIpc()
  registerInvoiceIpc()
  registerSettingsIpc()
  registerBackupIpc()
  registerDashboardIpc()
  registerExpenseIpc()
  registerPaymentIpc()
  registerHistoryIpc()
}