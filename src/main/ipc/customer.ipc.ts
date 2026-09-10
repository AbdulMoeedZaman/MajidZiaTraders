import { ipcMain } from 'electron'
import { CustomerService } from '../services/customer.service'
import type { CreateCustomerDTO, UpdateCustomerDTO, CustomerStatusFilter } from '@shared/types/customer'

const customerService = new CustomerService()

export function registerCustomerIpc(): void {
  ipcMain.handle('customers:list', () => {
    return customerService.list()
  })

  ipcMain.handle('customers:list-active', () => {
    return customerService.listActive()
  })

  ipcMain.handle('customers:list-inactive', () => {
    return customerService.listInactive()
  })

  ipcMain.handle('customers:list-with-balance', (_, filter: CustomerStatusFilter = 'all') => {
    return customerService.listWithBalances(filter)
  })

  ipcMain.handle('customers:get-by-id', (_, id: number) => {
    return customerService.getById(id)
  })

  ipcMain.handle('customers:get-with-balance', (_, id: number) => {
    return customerService.getWithBalance(id)
  })

  ipcMain.handle('customers:search', (_, query: string, status: CustomerStatusFilter = 'active') => {
    return customerService.search(query, status)
  })

  ipcMain.handle('customers:create', (_, data: CreateCustomerDTO) => {
    return customerService.create(data)
  })

  ipcMain.handle('customers:update', (_, id: number, data: UpdateCustomerDTO) => {
    return customerService.update(id, data)
  })

  ipcMain.handle('customers:set-active', (_, id: number, isActive: boolean) => {
    return customerService.setActive(id, isActive)
  })

  ipcMain.handle('customers:delete', (_, id: number) => {
    customerService.delete(id)
    return { success: true }
  })

  ipcMain.handle('customers:count', () => {
    return customerService.count()
  })

  ipcMain.handle('customers:count-active', () => {
    return customerService.countActive()
  })
}