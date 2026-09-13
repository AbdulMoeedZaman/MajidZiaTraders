import { registerProjectOwnerIpc } from './project-owner.ipc'
import { registerBrokerIpc } from './broker.ipc'
import { registerRouteIpc } from './route.ipc'
import { registerProductIpc } from './product.ipc'
import { registerStockIpc } from './stock.ipc'
import { registerCustomerIpc } from './customer.ipc'
import { registerInvoiceIpc } from './invoice.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerBackupIpc } from './backup.ipc'
import { registerDashboardIpc } from './dashboard.ipc'

export function registerAllIpc(): void {
  registerProjectOwnerIpc()
  registerBrokerIpc()
  registerRouteIpc()
  registerProductIpc()
  registerStockIpc()
  registerCustomerIpc()
  registerInvoiceIpc()
  registerSettingsIpc()
  registerBackupIpc()
  registerDashboardIpc()
}