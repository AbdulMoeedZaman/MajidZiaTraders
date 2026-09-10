import { app, BrowserWindow } from 'electron'
import path from 'path'
import { getDatabase, closeDatabase } from './database/connection'
import { InvoiceRepository } from './repositories/invoice.repository'
import { registerAllIpc } from './ipc'

function isSameAppOrigin(target: string, current: string): boolean {
  try {
    const a = new URL(target)
    const b = new URL(current)
    if (a.protocol === 'file:' && b.protocol === 'file:') return true
    return a.origin === b.origin
  } catch {
    return false
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  // The app never opens other windows or navigates away from its own pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (!isSameAppOrigin(url, win.webContents.getURL())) event.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  getDatabase()
  new InvoiceRepository().markOverdue()
  registerAllIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => closeDatabase())
