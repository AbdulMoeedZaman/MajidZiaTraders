import { ipcMain } from 'electron'
import { DataTransferService } from '../services/data-transfer.service'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { DataTransferEntity } from '@shared/types/data-transfer'

const dataTransferService = new DataTransferService()

const isEntity = (value: unknown): value is DataTransferEntity =>
  value === 'products' || value === 'customers' || value === 'invoices'

export function registerDataTransferIpc(): void {
  ipcMain.handle(IPC_CHANNELS.DATA_TRANSFER_TEMPLATE, (_, entity: DataTransferEntity) => {
    if (!isEntity(entity)) throw new Error('Unknown data type')
    return dataTransferService.template(entity)
  })
  ipcMain.handle(IPC_CHANNELS.DATA_TRANSFER_EXPORT, (_, entity: DataTransferEntity) => {
    if (!isEntity(entity)) throw new Error('Unknown data type')
    return dataTransferService.export(entity)
  })
  ipcMain.handle(
    IPC_CHANNELS.DATA_TRANSFER_IMPORT,
    (_, entity: DataTransferEntity, filePath: string) => {
      if (!isEntity(entity)) throw new Error('Unknown data type')
      if (typeof filePath !== 'string' || !filePath) throw new Error('File path is required')
      return dataTransferService.import(entity, filePath)
    }
  )
}