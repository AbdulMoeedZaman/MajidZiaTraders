import { BrowserWindow, dialog, ipcMain } from 'electron'
import { BackupService } from '../services/backup.service'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { localDate } from '@shared/date'
import type { DialogResult } from '@shared/types/backup'

const backupService = new BackupService()

function hostWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  try {
    return BrowserWindow.fromWebContents(event.sender)
  } catch {
    return null
  }
}

export function registerBackupIpc(): void {
  ipcMain.handle(IPC_CHANNELS.DIALOG_SAVE_BACKUP, async (event): Promise<DialogResult> => {
    const options: Electron.SaveDialogOptions = {
      title: 'Save database backup',
      defaultPath: `MZTraders-backup-${localDate(new Date())}.db`,
      buttonLabel: 'Create backup',
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    }
    const win = hostWindow(event)
    const result = win === null
      ? await dialog.showSaveDialog(options)
      : await dialog.showSaveDialog(win, options)
    if (result.canceled || !result.filePath) {
      return { canceled: true, path: null }
    }
    return { canceled: false, path: result.filePath }
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_BACKUP, async (event): Promise<DialogResult> => {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a backup file to restore',
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    }
    const win = hostWindow(event)
    const result = win === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(win, options)
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null }
    }
    return { canceled: false, path: result.filePaths[0] }
  })

  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, (_event, destinationPath: string) =>
    backupService.createBackup(destinationPath),
  )
  ipcMain.handle(IPC_CHANNELS.BACKUP_VALIDATE, (_event, sourcePath: string) =>
    backupService.validateBackup(sourcePath),
  )
  ipcMain.handle(IPC_CHANNELS.BACKUP_RESTORE, (_event, sourcePath: string) =>
    backupService.restoreBackup(sourcePath),
  )
}