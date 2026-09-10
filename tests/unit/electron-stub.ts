// Minimal stand-in for the `electron` module so main-process services can run under Vitest.
import os from 'os'

export const app = {
  getPath(name: string): string {
    if (name === 'temp') return os.tmpdir()
    const dir = process.env.TEST_USER_DATA
    if (!dir) throw new Error('TEST_USER_DATA is not set — call useTestDatabase() in the test file')
    return dir
  },
  getVersion: (): string => '0.0.0-test',
  isPackaged: false,
}

export const ipcMain = { handle: (): void => undefined }
export const dialog = {}
export const BrowserWindow = {}

export default { app, ipcMain, dialog, BrowserWindow }
