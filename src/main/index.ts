import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { prepararAudio, publicarAudio, listarAudios, transcribirAudio, cancelarTranscripcion, audioOcupado, textoTranscrito, generarImagenAudio, quitarImagenAudio, editarAudio } from './lib/audios'
import { titularOracionConCodex } from './lib/codexFormat'
import { GestorModelo } from './lib/transcripcion/modelo'
import { encontrarWhisper } from './lib/transcripcion/motor'
import { cargarConfig, getConfigPath } from './lib/config'
import { listarCategorias } from './lib/categorias'
import { listarPublicaciones } from './lib/publicaciones'
import { leerTemas, renombrarTema, RUTA_TEMAS } from './lib/temas'
import { borrarPublicacion } from './lib/borrar'
import { cambiarTitulo } from './lib/editarPost'
import { leerVisitas } from './lib/analitica'
import { confirmar } from './lib/publish'
import { sincronizar } from './lib/git'
import { registrarEsquemaImagen, servirImagenes } from './lib/imagenes'
import { procesarDocumento } from './lib/pipeline'
import { procesarDocumentosEnLote } from './lib/pipelineLote'
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
  const modelos = new GestorModelo(join(app.getPath('userData'), 'models', 'whisper'))
  ipcMain.handle('transcriptor-estado', async () => ({ modelo: await modelos.consultar(), motorDisponible: !!(await encontrarWhisper()) }))
  ipcMain.handle('transcriptor-descargar', () => modelos.download())
  ipcMain.handle('transcriptor-cancelar-descarga', () => modelos.cancelar())
  ipcMain.handle('transcriptor-eliminar', () => modelos.eliminar())
  ipcMain.handle('transcribir-audio', (_event, id: string) => transcribirAudio(id, modelos, n => mainWindow?.webContents.send('transcripcion-progreso', n)))
  ipcMain.handle('cancelar-transcripcion', () => cancelarTranscripcion())
  app.on('before-quit', (event) => {
    if (audioOcupado()) {
      event.preventDefault()
      if (mainWindow) dialog.showMessageBox(mainWindow, { type: 'info', message: 'Hay un audio en proceso.', detail: 'Espera a que termine o cancela la transcripción antes de cerrar.', buttons: ['Entendido'] })
    } else modelos.cancelar()
  })

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

  ipcMain.handle('elegir-audio', async () => {
    if (!mainWindow) return null
    const resultado = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Notas de voz', extensions: ['m4a', 'mp3', 'wav', 'ogg', 'opus', 'aac', 'flac', 'amr', 'mp4', 'webm'] }]
    })
    return resultado.canceled ? null : resultado.filePaths[0] ?? null
  })
  ipcMain.handle('preparar-audio', (_event, archivo: string) => prepararAudio(archivo))
  ipcMain.handle('listar-audios', async () => {
    const config = await cargarConfig()
    if (!config) throw new Error('Falta configurar la aplicación. Contacta a Lucas.')
    return listarAudios(config.repoPath)
  })
  ipcMain.handle('sugerir-titulo-audio', async (_event, id: string, textos: string[]) => {
    // Los párrafos ya corregidos por el usuario mandan; si no llegan, vale la transcripción cruda.
    const texto = Array.isArray(textos) && textos.length ? textos.map(String).join('\n\n') : textoTranscrito(id)
    if (!texto.trim()) throw new Error('No hay texto para sugerir un título.')
    // El renderer no muestra este error (el fallback es escribir a mano); queda aquí para diagnosticar.
    return titularOracionConCodex(texto).catch((e: unknown) => { console.error('[sugerir-titulo-audio]', e); throw e })
  })
  ipcMain.handle('generar-imagen-audio', async (_event, id: string, prompt: string) => {
    const config = await cargarConfig()
    if (!config) throw new Error('Falta configurar la aplicación. Contacta a Lucas.')
    return generarImagenAudio(id, prompt, config.falApiKey).catch((e: unknown) => { console.error('[generar-imagen-audio]', e); throw e })
  })
  ipcMain.handle('quitar-imagen-audio', (_event, id: string) => quitarImagenAudio(id))
  ipcMain.handle('editar-audio', async (_event, id: string, cambios: { titulo: string; descripcion: string; tema: string }) => {
    const config = await cargarConfig()
    if (!config) throw new Error('Falta configurar la aplicación. Contacta a Lucas.')
    return editarAudio(config.repoPath, id, cambios)
  })
  ipcMain.handle('publicar-audio', async (_event, id: string, titulo: string, descripcion: string, tema: string, textos?: string[]) => {
    const config = await cargarConfig()
    if (!config) throw new Error('Falta configurar la aplicación. Contacta a Lucas.')
    return publicarAudio(config.repoPath, id, titulo, descripcion, tema, textos)
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

  ipcMain.handle('procesar-documentos', async (_event, filePaths: string[], categoria: string) => {
    if (!mainWindow) throw new Error('Ventana no disponible.')
    const config = await cargarConfig()
    if (!config) {
      throw new Error('Falta configurar la aplicación. Contacta a Lucas.')
    }
    return procesarDocumentosEnLote(filePaths, categoria ?? '', config, (evento) => {
      mainWindow?.webContents.send('progreso-lote', evento)
    })
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

  ipcMain.handle('cambiar-titulo', async (_event, archivo: string, tituloNuevo: string) => {
    const config = await cargarConfig()
    if (!config) throw new Error('Falta configurar la aplicación. Contacta a Lucas.')

    // Sincronizar antes: si la reflexión cambió desde el Mac del Dr. Luis,
    // mejor escribir sobre la versión de ahora que sobre una copia vieja.
    await sincronizar(config.repoPath)

    const r = await cambiarTitulo(config.repoPath, archivo, tituloNuevo)
    await confirmar(config.repoPath, `título: ${r.titulo}`, [
      `content/posts/${r.archivo}`
    ])
    return r
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

  ipcMain.handle('leer-visitas', async (_event, dias: number, rutas: string[]) => {
    const config = await cargarConfig()
    if (!config) throw new Error('Falta configurar la aplicación. Contacta a Lucas.')
    if (!config.goatcounter?.site || !config.goatcounter?.token) return null
    return leerVisitas(config.goatcounter, dias, rutas)
  })

  ipcMain.handle('abrir-enlace', (_event, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('buscar-actualizaciones', () => {
    buscarActualizaciones()
  })

  ipcMain.handle('obtener-version-app', () => app.getVersion())

  ipcMain.handle('instalar-actualizacion', () => {
    if (audioOcupado()) throw new Error('Espera a que termine el audio antes de reiniciar.')
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
