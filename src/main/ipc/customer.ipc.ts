import { BrowserWindow, dialog, ipcMain } from 'electron'
import { CustomerService } from '../services/customer.service'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { CreateCustomerDTO, UpdateCustomerDTO } from '@shared/types/customer'
import type { DialogResult } from '@shared/types/backup'

const customerService = new CustomerService()

export function registerCustomerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_LIST, () => customerService.list())
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_LIST_BY_ROUTE, (_, routeId: number) => customerService.listByRoute(routeId))
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_GET_BY_ID, (_, id: number) => customerService.getByIdWithRoute(id))
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_SEARCH, (_, query: string) => customerService.search(query))
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_CREATE, (_, data: CreateCustomerDTO) => customerService.create(data))
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_UPDATE, (_, id: number, data: UpdateCustomerDTO) =>
    customerService.update(id, data)
  )
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_DELETE, (_, id: number) => {
    customerService.delete(id)
    return { success: true }
  })
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_COUNT, () => customerService.count())
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_IMPORT_EXCEL, (_, filePath: string, routeId: number) =>
    customerService.importFromExcel(filePath, routeId)
  )

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_EXCEL, async (event): Promise<DialogResult> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Choose an Excel store listing to import customers from',
      properties: ['openFile'],
      filters: [{ name: 'Excel files', extensions: ['xlsx'] }],
    }
    const result = win === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(win, options)
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null }
    }
    return { canceled: false, path: result.filePaths[0] }
  })
}