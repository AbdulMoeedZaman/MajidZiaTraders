import { ipcMain } from 'electron'
import { BackupService } from '../services/backup.service'
import { assertUserFilePath, BACKUP_EXTENSIONS } from './path-guard'

const backupService = new BackupService()

export function registerBackupIpc(): void {
  ipcMain.handle('backup:create', async (_, destinationPath: string) => {
    const withExtension =
      typeof destinationPath === 'string' && !/\.(db|sqlite3?)$/i.test(destinationPath)
        ? `${destinationPath}.db`
        : destinationPath
    return backupService.createBackup(assertUserFilePath(withExtension, BACKUP_EXTENSIONS, 'Backup'))
  })

  ipcMain.handle('backup:validate', (_, filePath: string) => {
    return backupService.validateBackup(assertUserFilePath(filePath, BACKUP_EXTENSIONS, 'Backup file'))
  })

  ipcMain.handle('backup:restore', async (_, filePath: string) => {
    return backupService.restoreBackup(assertUserFilePath(filePath, BACKUP_EXTENSIONS, 'Backup file'))
  })
}
