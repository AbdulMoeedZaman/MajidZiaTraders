import { ipcMain } from 'electron'
import { BrokerService } from '../services/broker.service'
import type { CreateBrokerDTO, UpdateBrokerDTO } from '@shared/types/broker'

const brokerService = new BrokerService()

export function registerBrokerIpc(): void {
  ipcMain.handle('brokers:list', () => brokerService.list())
  ipcMain.handle('brokers:get-by-id', (_, id: number) => brokerService.getById(id))
  ipcMain.handle('brokers:create', (_, data: CreateBrokerDTO) => brokerService.create(data))
  ipcMain.handle('brokers:update', (_, id: number, data: UpdateBrokerDTO) =>
    brokerService.update(id, data)
  )
  ipcMain.handle('brokers:delete', (_, id: number) => {
    brokerService.delete(id)
    return { success: true }
  })
  ipcMain.handle('brokers:count', () => brokerService.count())
}