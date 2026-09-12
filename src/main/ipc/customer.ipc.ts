import { ipcMain } from 'electron'
import { CustomerService } from '../services/customer.service'
import type { CreateCustomerDTO, UpdateCustomerDTO } from '@shared/types/customer'

const customerService = new CustomerService()

export function registerCustomerIpc(): void {
  ipcMain.handle('customers:list', () => customerService.list())
  ipcMain.handle('customers:list-by-route', (_, routeId: number) => customerService.listByRoute(routeId))
  ipcMain.handle('customers:get-by-id', (_, id: number) => customerService.getByIdWithRoute(id))
  ipcMain.handle('customers:search', (_, query: string) => customerService.search(query))
  ipcMain.handle('customers:create', (_, data: CreateCustomerDTO) => customerService.create(data))
  ipcMain.handle('customers:update', (_, id: number, data: UpdateCustomerDTO) =>
    customerService.update(id, data)
  )
  ipcMain.handle('customers:delete', (_, id: number) => {
    customerService.delete(id)
    return { success: true }
  })
  ipcMain.handle('customers:count', () => customerService.count())
}