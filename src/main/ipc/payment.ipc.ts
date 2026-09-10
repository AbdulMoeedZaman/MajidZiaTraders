import { ipcMain } from 'electron'
import { PaymentService } from '../services/payment.service'
import type { CreateCustomerPaymentDTO } from '@shared/types/customer-payment'

const paymentService = new PaymentService()

export function registerPaymentIpc(): void {
  ipcMain.handle('payments:list', () => {
    return paymentService.list()
  })

  ipcMain.handle('payments:get-by-id', (_, id: number) => {
    return paymentService.getById(id)
  })

  ipcMain.handle('payments:list-by-customer', (_, customerId: number) => {
    return paymentService.listByCustomer(customerId)
  })

  ipcMain.handle('payments:list-by-invoice', (_, invoiceId: number) => {
    return paymentService.listByInvoice(invoiceId)
  })

  ipcMain.handle('payments:list-between', (_, from: string, to: string) => {
    return paymentService.listBetween(from, to)
  })

  ipcMain.handle('payments:create', (_, data: CreateCustomerPaymentDTO) => {
    return paymentService.create(data)
  })

  ipcMain.handle('payments:delete', (_, id: number) => {
    paymentService.delete(id)
    return { success: true }
  })
}