import { ipcMain } from 'electron'
import { CustomerLedgerService } from '../services/customer-ledger.service'
import type { CreateCustomerLedgerDTO } from '@shared/types/customer-ledger'

const customerLedgerService = new CustomerLedgerService()

export function registerCustomerLedgerIpc(): void {
  ipcMain.handle('customer-ledger:list-by-customer', (_, customerId: number) => {
    return customerLedgerService.listByCustomer(customerId)
  })

  ipcMain.handle('customer-ledger:list', (_, customerId: number, from?: string, to?: string) => {
    return customerLedgerService.query(customerId, from, to)
  })

  ipcMain.handle('customer-ledger:latest', (_, customerId: number, limit: number) => {
    return customerLedgerService.query(customerId, undefined, undefined, limit)
  })

  ipcMain.handle('customer-ledger:get-by-id', (_, id: number) => {
    return customerLedgerService.getById(id)
  })

  ipcMain.handle('customer-ledger:get-balance', (_, customerId: number) => {
    return customerLedgerService.getBalance(customerId)
  })

  ipcMain.handle('customer-ledger:get-outstanding', (_, customerId: number) => {
    return customerLedgerService.getOutstandingBalance(customerId)
  })

  ipcMain.handle('customer-ledger:balance-at-date', (_, customerId: number, date: string) => {
    return customerLedgerService.getBalanceAtDate(customerId, date)
  })

  ipcMain.handle('customer-ledger:summary', (_, customerId: number) => {
    return customerLedgerService.getSummary(customerId)
  })

  ipcMain.handle('customer-ledger:create', (_, data: CreateCustomerLedgerDTO) => {
    return customerLedgerService.create(data)
  })
}