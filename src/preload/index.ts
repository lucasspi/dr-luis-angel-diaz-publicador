import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface ConfigInfo {
  configurado: boolean
  configPath: string
}

export interface ResultadoProceso {
  url: string
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
  procesarDocumento: (filePath: string): Promise<ResultadoProceso> =>
    ipcRenderer.invoke('procesar-documento', filePath),
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
