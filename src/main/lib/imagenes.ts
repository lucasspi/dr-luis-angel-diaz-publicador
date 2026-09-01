import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { cargarConfig } from './config'

/**
 * Las portadas viven en `public/img/` del clone del sitio, fuera del bundle del
 * renderer — y desde http://localhost:5173 (dev) o file:// (empaquetado) no se
 * pueden cargar con una ruta de disco. En vez de bajar `webSecurity` o mandar
 * cada JPG en base64 por IPC (373 KB de media, 50 por página), se registra un
 * esquema propio: `reflexion-img://local/img/foo.jpg`.
 */
export const ESQUEMA_IMAGEN = 'reflexion-img'

// Debe correr ANTES de app.whenReady() — si no, el esquema no queda registrado
// como estándar y la URL no se parsea como http (sin host ni pathname).
export function registrarEsquemaImagen(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ESQUEMA_IMAGEN, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

export function servirImagenes(): void {
  protocol.handle(ESQUEMA_IMAGEN, async (request) => {
    const config = await cargarConfig()
    if (!config) return new Response('Sin configuración', { status: 404 })

    const raiz = path.join(config.repoPath, 'public')
    const pedido = path.join(raiz, decodeURIComponent(new URL(request.url).pathname))

    // El nombre viene del frontmatter, que es texto libre: sin este guardia un
    // `imagen: /../../.ssh/id_rsa` saldría por aquí.
    const resuelto = path.resolve(pedido)
    if (resuelto !== raiz && !resuelto.startsWith(raiz + path.sep)) {
      return new Response('Fuera de la carpeta del sitio', { status: 403 })
    }

    return net.fetch(pathToFileURL(resuelto).toString())
  })
}

/** La URL con la que el renderer pide una portada, a partir del frontmatter. */
export function urlImagen(imagenRelativa: string): string {
  if (!imagenRelativa) return ''
  const limpia = imagenRelativa.startsWith('/') ? imagenRelativa : `/${imagenRelativa}`
  return `${ESQUEMA_IMAGEN}://local${limpia}`
}
