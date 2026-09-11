import { ipcMain } from 'electron'
import { CustomerService } from '../services/customer.service'
import type { CreateCustomerDTO, UpdateCustomerDTO } from '@shared/types/customer'

const customerService = new CustomerService()

export function registerCustomerIpc(): void {
  ipcMain.handle('customers:list', () => {
    return customerService.list()
  })

  ipcMain.handle('customers:list-with-balance', () => {
    return customerService.listWithBalances()
  })

  ipcMain.handle('customers:get-by-id', (_, id: number) => {
    return customerService.getById(id)
  })

  ipcMain.handle('customers:get-with-balance', (_, id: number) => {
    return customerService.getWithBalance(id)
  })

  ipcMain.handle('customers:search', (_, query: string) => {
    return customerService.search(query)
  })

  ipcMain.handle('customers:create', (_, data: CreateCustomerDTO) => {
    return customerService.create(data)
  })

  ipcMain.handle('customers:update', (_, id: number, data: UpdateCustomerDTO) => {
    return customerService.update(id, data)
  })

  ipcMain.handle('customers:delete', (_, id: number) => {
    customerService.delete(id)
    return { success: true }
  })

  ipcMain.handle('customers:count', () => {
    return customerService.count()
  })
}