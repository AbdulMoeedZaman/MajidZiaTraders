import { ipcMain } from 'electron'
import { InvoiceService } from '../services/invoice.service'
import type { CreateInvoiceDTO } from '@shared/types/invoice'

const invoiceService = new InvoiceService()

export function registerInvoiceIpc(): void {
  ipcMain.handle('invoices:list', () => invoiceService.list())
  ipcMain.handle('invoices:get-by-id', (_, id: number) => invoiceService.getById(id))
  ipcMain.handle('invoices:get-with-details', (_, id: number) => invoiceService.getWithDetails(id))
  ipcMain.handle('invoices:list-by-customer', (_, customerId: number) =>
    invoiceService.listByCustomer(customerId)
  )
  ipcMain.handle('invoices:create', (_, data: CreateInvoiceDTO) => invoiceService.create(data))
  ipcMain.handle('invoices:build-load-form', (_event, invoiceIds: number[]) =>
    invoiceService.buildLoadReport(invoiceIds)
  )
  ipcMain.handle('invoices:delete', (_, id: number) => {
    invoiceService.delete(id)
    return { success: true }
  })
  ipcMain.handle('invoices:count', () => invoiceService.count())
}