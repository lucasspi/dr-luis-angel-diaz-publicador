import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { cargarConfig, getConfigPath } from './lib/config'
import { listarCategorias } from './lib/categorias'
import { listarPublicaciones } from './lib/publicaciones'
import { leerTemas, renombrarTema, RUTA_TEMAS } from './lib/temas'
import { borrarPublicacion } from './lib/borrar'
import { confirmar } from './lib/publish'
import { sincronizar } from './lib/git'
import { registrarEsquemaImagen, servirImagenes } from './lib/imagenes'
import { procesarDocumento } from './lib/pipeline'
import { buscarActualizaciones, configurarActualizaciones, instalarActualizacion } from './lib/updates'

// Antes de whenReady, o el esquema no queda registrado como estándar.
registrarEsquemaImagen()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Redimensionable desde que existe la lista de publicaciones: 194 reflexiones
  // no caben en la ventanita fija que alcanzaba para arrastrar un documento.
  //
  // El mínimo lo manda la tabla, no la pantalla de publicar. Las columnas de
  // ancho fijo suman 520 (portada 88 + fecha 140 + tema 220 + acción 72) y el
  // contenedor se lleva 48 de padding: por debajo de ~880 la columna de título
  // se estrangula y los títulos largos parten en tres líneas. La barra de
  // filtros pide algo parecido para no apilarse en tres filas.
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 880,
    minHeight: 620,
    autoHideMenuBar: true,
    // Sin barra de título propia: los semáforos flotan sobre la cabecera de la
    // app (como Zoom o Slack). La `y` los centra en la franja de 52px que
    // dibuja el renderer; la `x` los alinea con su margen izquierdo.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 18 } }
      : {}),
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

  servirImagenes()

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

  ipcMain.handle('listar-publicaciones', async (_event, sincronizarAntes: boolean) => {
    const config = await cargarConfig()
    if (!config) throw new Error('Falta configurar la aplicación. Contacta a Lucas.')
    // El pull puede fallar (sin red, rebase con conflicto) sin que eso invalide
    // la lista: se devuelve lo que hay en el clone y la pantalla avisa.
    let avisoSync = ''
    if (sincronizarAntes) {
      try {
        await sincronizar(config.repoPath)
      } catch (err) {
        avisoSync = err instanceof Error ? err.message : String(err)
      }
    }
    return { publicaciones: await listarPublicaciones(config.repoPath), avisoSync }
  })

  ipcMain.handle('listar-temas', async () => {
    const config = await cargarConfig()
    if (!config) return []
    return leerTemas(config.repoPath)
  })

  ipcMain.handle('renombrar-tema', async (_event, id: string, nombreNuevo: string) => {
    const config = await cargarConfig()
    if (!config) throw new Error('Falta configurar la aplicación. Contacta a Lucas.')

    // Sincronizar primero: si el Dr. Luis publicó desde su Mac, el registro
    // local puede no tener el tema recién estrenado, y lo reescribiríamos
    // encima. Si el pull falla se aborta — mejor no renombrar que pisar algo.
    await sincronizar(config.repoPath)

    const tema = await renombrarTema(config.repoPath, id, nombreNuevo)
    await confirmar(config.repoPath, `tema: «${tema.nombre}»`, [RUTA_TEMAS])
    return tema
  })

  ipcMain.handle('borrar-publicacion', async (_event, archivo: string, titulo: string) => {
    const config = await cargarConfig()
    if (!config) throw new Error('Falta configurar la aplicación. Contacta a Lucas.')

    // Sincronizar antes: si la reflexión ya se borró desde otro sitio, o si hay
    // publicaciones nuevas, mejor enterarse ahora que a mitad del push.
    await sincronizar(config.repoPath)

    const resultado = await borrarPublicacion(config.repoPath, archivo)
    // `git rm` ya dejó el borrado en el índice; confirmar solo commitea y sube.
    await confirmar(config.repoPath, `borrar: ${titulo}`, [])
    return resultado
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
