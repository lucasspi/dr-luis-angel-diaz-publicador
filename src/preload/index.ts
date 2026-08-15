import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface ConfigInfo {
  configurado: boolean
  configPath: string
}

export interface ResultadoProceso {
  url: string
}

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
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
