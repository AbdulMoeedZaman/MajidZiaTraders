import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions, SaveDialogOptions } from 'electron'

export function registerDialogIpc(): void {
  ipcMain.handle('dialog:select-file', async (event, options?: Partial<OpenDialogOptions>) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(win as never, {
      properties: ['openFile'],
      filters: [
        { name: 'CSV files', extensions: ['csv', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
      ...options,
    } as OpenDialogOptions)
    return { canceled: result.canceled, filePaths: result.filePaths, filePath: result.filePaths[0] ?? null }
  })

  ipcMain.handle('dialog:select-directory', async (event, options?: Partial<OpenDialogOptions>) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(win as never, {
      properties: ['openDirectory', 'createDirectory'],
      ...options,
    } as OpenDialogOptions)
    return { canceled: result.canceled, filePaths: result.filePaths, filePath: result.filePaths[0] ?? null }
  })

  ipcMain.handle('dialog:save-file', async (event, options?: Partial<SaveDialogOptions>) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showSaveDialog(win as never, {
      defaultPath: 'export.csv',
      filters: [
        { name: 'CSV files', extensions: ['csv'] },
        { name: 'SQLite backups', extensions: ['db'] },
        { name: 'All files', extensions: ['*'] },
      ],
      ...options,
    } as SaveDialogOptions)
    return { canceled: result.canceled, filePath: result.filePath ?? null }
  })
}