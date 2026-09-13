import { app, dialog } from 'electron'

const UPDATE_CHECK_DELAY_MS = 5000

/**
 * Wires up electron-updater for the NSIS Windows installer.
 *
 * - No-op outside the packaged app (dev/preview never phone home).
 * - autoDownload is false: we prompt before downloading, and again before
 *   quitting to install, so the user stays in control.
 * - Requires `build.publish` in package.json: point that URL at the server that
 *   hosts the generated update artifacts (newest.yml + the installer).
 * - The updater updates files in place; because the appId/productName never
 *   change, every release installs over the previous one.
 */
export async function initAutoUpdater(): Promise<void> {
  if (!app.isPackaged) return

  const { autoUpdater } = await import('electron-updater')
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('error', (error) => {
    console.error('[auto-update] error:', error)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: `MZTraders ${info.version} has been downloaded.`,
      detail: 'Restart now to finish installing the update?',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true)
    }
  })

  setTimeout(() => {
    autoUpdater
      .checkForUpdates()
      .catch((error) => console.warn('[auto-update] check failed:', error))
  }, UPDATE_CHECK_DELAY_MS)
}