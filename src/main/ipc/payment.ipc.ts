import { ipcMain } from 'electron'
import { PaymentService } from '../services/payment.service'

const paymentService = new PaymentService()

export function registerPaymentIpc(): void {
  ipcMain.handle('invoices:pay', (_event, invoiceId: number, amount: number) =>
    paymentService.payInvoice(invoiceId, amount)
  )
  ipcMain.handle('customers:pay', (_event, customerId: number, amount: number) =>
    paymentService.payCustomer(customerId, amount)
  )
  ipcMain.handle('payments:list-by-invoice', (_event, invoiceId: number) =>
    paymentService.listByInvoice(invoiceId)
  )
  ipcMain.handle('payments:list-by-customer', (_event, customerId: number) =>
    paymentService.listByCustomer(customerId)
  )
}