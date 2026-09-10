import { ipcMain } from 'electron'
import { InvoiceService } from '../services/invoice.service'
import type { CreateInvoiceDTO, UpdateInvoiceDTO } from '@shared/types/invoice'

const invoiceService = new InvoiceService()

export function registerInvoiceIpc(): void {
  ipcMain.handle('invoices:list', () => {
    return invoiceService.list()
  })

  ipcMain.handle('invoices:get-by-id', (_, id: number) => {
    return invoiceService.getById(id)
  })

  ipcMain.handle('invoices:get-with-items', (_, id: number) => {
    return invoiceService.getWithItems(id)
  })

  ipcMain.handle('invoices:get-items', (_, invoiceId: number) => {
    return invoiceService.getItems(invoiceId)
  })

  ipcMain.handle('invoices:list-by-customer', (_, customerId: number) => {
    return invoiceService.listByCustomer(customerId)
  })

  ipcMain.handle('invoices:list-by-status', (_, status: string) => {
    return invoiceService.listByStatus(status as never)
  })

  ipcMain.handle('invoices:list-between', (_, from: string, to: string) => {
    return invoiceService.listBetween(from, to)
  })

  ipcMain.handle('invoices:create', (_, data: CreateInvoiceDTO) => {
    return invoiceService.create(data)
  })

  ipcMain.handle('invoices:update', (_, id: number, data: UpdateInvoiceDTO) => {
    return invoiceService.update(id, data)
  })

  ipcMain.handle('invoices:cancel', (_, id: number) => {
    return invoiceService.cancel(id)
  })

  ipcMain.handle('invoices:refresh-overdue', () => {
    return { changed: invoiceService.refreshOverdue() }
  })

  ipcMain.handle('invoices:delete', (_, id: number) => {
    invoiceService.delete(id)
    return { success: true }
  })
}