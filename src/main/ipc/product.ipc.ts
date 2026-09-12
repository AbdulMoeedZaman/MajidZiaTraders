import { BrowserWindow, dialog, ipcMain } from 'electron'
import { ProductService } from '../services/product.service'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { CreateProductDTO, UpdateProductDTO } from '@shared/types/product'
import type { DialogResult } from '@shared/types/backup'

const productService = new ProductService()

export function registerProductIpc(): void {
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_LIST, () => productService.list())
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_SEARCH, (_, query: string) => productService.search(query))
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_GET_BY_ID, (_, id: number) => productService.getById(id))
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_CREATE, (_, data: CreateProductDTO) => productService.create(data))
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_UPDATE, (_, id: number, data: UpdateProductDTO) =>
    productService.update(id, data)
  )
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_DELETE, (_, id: number) => {
    productService.delete(id)
    return { success: true }
  })
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_COUNT, () => productService.count())
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_IMPORT_CSV, (_, filePath: string) =>
    productService.importFromCsv(filePath)
  )

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_CSV, async (event): Promise<DialogResult> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a CSV file to import products from',
      properties: ['openFile'],
      filters: [{ name: 'CSV files', extensions: ['csv'] }],
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