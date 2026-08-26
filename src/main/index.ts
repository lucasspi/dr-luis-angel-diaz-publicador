import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { cargarConfig, getConfigPath } from './lib/config'
import { listarCategorias } from './lib/categorias'
import { procesarDocumento } from './lib/pipeline'
import { buscarActualizaciones, configurarActualizaciones, instalarActualizacion } from './lib/updates'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 640,
    height: 560,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.spirandeli.drluisangeldiaz.publicador')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Publicador',
        submenu: [
          {
            label: 'Abrir carpeta de configuración',
            click: () => shell.showItemInFolder(getConfigPath())
          },
          { role: 'quit' }
        ]
      }
    ])
  )

  ipcMain.handle('obtener-config', async () => {
    const config = await cargarConfig()
    return { configurado: config !== null, configPath: getConfigPath() }
  })

  ipcMain.handle('elegir-documento', async () => {
    if (!mainWindow) return null
    const resultado = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Documentos', extensions: ['docx', 'pdf'] }]
    })
    if (resultado.canceled || resultado.filePaths.length === 0) return null
    return resultado.filePaths[0]
  })

  ipcMain.handle('procesar-documento', async (_event, filePath: string, categoria: string) => {
    if (!mainWindow) throw new Error('Ventana no disponible.')
    const config = await cargarConfig()
    if (!config) {
      throw new Error('Falta configurar la aplicación. Contacta a Lucas.')
    }
    return procesarDocumento(filePath, categoria ?? '', config, mainWindow)
  })

  ipcMain.handle('listar-categorias', async () => {
    const config = await cargarConfig()
    if (!config) return []
    return listarCategorias(config.repoPath)
  })

  ipcMain.handle('abrir-enlace', (_event, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('buscar-actualizaciones', () => {
    buscarActualizaciones()
  })

  ipcMain.handle('instalar-actualizacion', () => {
    instalarActualizacion()
  })

  createWindow()

  if (mainWindow) {
    configurarActualizaciones(mainWindow)
    if (!is.dev) {
      buscarActualizaciones()
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
