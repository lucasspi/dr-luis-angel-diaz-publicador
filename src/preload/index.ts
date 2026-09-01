import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface ConfigInfo {
  configurado: boolean
  configPath: string
}

export interface ResultadoProceso {
  url: string
}

export interface Tema {
  /** La clave. Es lo que el frontmatter referencia. No cambia nunca. */
  id: string
  /** La etiqueta que ve el lector — lo único que edita un renombrado. */
  nombre: string
  /** La URL: /categoria/<slug>. Se queda quieta aunque cambie el nombre. */
  slug: string
}

export interface Publicacion {
  id: string
  slug: string
  titulo: string
  fecha: string
  temaId: string
  categoria: string
  categoriaSlug: string
  resumen: string
  imagen: string
  thumbUrl: string
  url: string
  archivo: string
}

export interface ResultadoBorrado {
  archivo: string
  /** La portada, si se fue con la reflexión. Vacío si se quedó. */
  imagenBorrada: string
  /** Por qué la portada se quedó: la usan estos otros posts. */
  imagenCompartidaCon: string[]
}

export interface Visitas {
  desde: string
  hasta: string
  total: number
  porRuta: { ruta: string; visitas: number }[]
}

export interface ResultadoPublicaciones {
  publicaciones: Publicacion[]
  /** Vacío si el pull salió bien; si no, por qué la lista puede estar atrasada. */
  avisoSync: string
}

export type EstadoActualizacion =
  | { fase: 'buscando' }
  | { fase: 'disponible'; version: string }
  | { fase: 'no-disponible' }
  | { fase: 'descargando'; porcentaje: number }
  | { fase: 'descargada'; version: string }
  | { fase: 'error'; mensaje: string }

const api = {
  obtenerConfig: (): Promise<ConfigInfo> => ipcRenderer.invoke('obtener-config'),
  elegirDocumento: (): Promise<string | null> => ipcRenderer.invoke('elegir-documento'),
  listarCategorias: (): Promise<string[]> => ipcRenderer.invoke('listar-categorias'),
  listarPublicaciones: (sincronizarAntes = false): Promise<ResultadoPublicaciones> =>
    ipcRenderer.invoke('listar-publicaciones', sincronizarAntes),
  listarTemas: (): Promise<Tema[]> => ipcRenderer.invoke('listar-temas'),
  renombrarTema: (id: string, nombreNuevo: string): Promise<Tema> =>
    ipcRenderer.invoke('renombrar-tema', id, nombreNuevo),
  borrarPublicacion: (archivo: string, titulo: string): Promise<ResultadoBorrado> =>
    ipcRenderer.invoke('borrar-publicacion', archivo, titulo),
  /** null cuando no hay analítica configurada en config.json. */
  leerVisitas: (dias: number, rutas: string[]): Promise<Visitas | null> =>
    ipcRenderer.invoke('leer-visitas', dias, rutas),
  cambiarTitulo: (archivo: string, tituloNuevo: string): Promise<{ archivo: string; titulo: string }> =>
    ipcRenderer.invoke('cambiar-titulo', archivo, tituloNuevo),
  procesarDocumento: (filePath: string, categoria: string): Promise<ResultadoProceso> =>
    ipcRenderer.invoke('procesar-documento', filePath, categoria),
  abrirEnlace: (url: string): Promise<void> => ipcRenderer.invoke('abrir-enlace', url),
  onProgreso: (callback: (mensaje: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, mensaje: string): void => callback(mensaje)
    ipcRenderer.on('progreso', listener)
    return () => ipcRenderer.removeListener('progreso', listener)
  },
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  buscarActualizaciones: (): Promise<void> => ipcRenderer.invoke('buscar-actualizaciones'),
  instalarActualizacion: (): Promise<void> => ipcRenderer.invoke('instalar-actualizacion'),
  onEstadoActualizacion: (callback: (estado: EstadoActualizacion) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, estado: EstadoActualizacion): void =>
      callback(estado)
    ipcRenderer.on('estado-actualizacion', listener)
    return () => ipcRenderer.removeListener('estado-actualizacion', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
