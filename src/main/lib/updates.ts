import type { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'

export type EstadoActualizacion =
  | { fase: 'buscando' }
  | { fase: 'disponible'; version: string }
  | { fase: 'no-disponible' }
  | { fase: 'descargando'; porcentaje: number }
  | { fase: 'descargada'; version: string }
  | { fase: 'error'; mensaje: string }

let ventanaRef: BrowserWindow | null = null

export function configurarActualizaciones(ventana: BrowserWindow): void {
  ventanaRef = ventana

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => avisar({ fase: 'buscando' }))
  autoUpdater.on('update-available', (info) => avisar({ fase: 'disponible', version: info.version }))
  autoUpdater.on('update-not-available', () => avisar({ fase: 'no-disponible' }))
  autoUpdater.on('download-progress', (progreso) =>
    avisar({ fase: 'descargando', porcentaje: Math.round(progreso.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => avisar({ fase: 'descargada', version: info.version }))
  autoUpdater.on('error', (err) => avisar({ fase: 'error', mensaje: err.message }))
}

function avisar(estado: EstadoActualizacion): void {
  ventanaRef?.webContents.send('estado-actualizacion', estado)
}

export function buscarActualizaciones(): void {
  if (is.dev) {
    avisar({ fase: 'error', mensaje: 'Las actualizaciones no están disponibles en modo desarrollo.' })
    return
  }
  autoUpdater.checkForUpdates().catch((err) => {
    avisar({ fase: 'error', mensaje: err instanceof Error ? err.message : String(err) })
  })
}

export function instalarActualizacion(): void {
  autoUpdater.quitAndInstall()
}
