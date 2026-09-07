import type { AppConfig } from './config'
import type { ListaSuscriptores } from '../../preload'

/** Credentials stay in the main process. Nothing is written to the repository. */
export async function listarSuscriptores(config: AppConfig['newsletter']): Promise<ListaSuscriptores | null> {
  if (!config) return null
  const url = new URL(config.endpoint)
  if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname) || url.search || url.hash || url.username || url.password)
    throw new Error('La dirección de suscriptores debe ser una aplicación web de Google Apps Script.')
  if (!config.readToken || config.readToken.length < 32) throw new Error('Falta configurar la clave de lectura de suscriptores.')
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST', body: new URLSearchParams({ action: 'suscriptores', token: config.readToken }),
      signal: AbortSignal.timeout(30000)
    })
  } catch { throw new Error('No se pudo conectar con la lista. Comprueba tu conexión e inténtalo otra vez.') }
  if (!response.ok) throw new Error('La lista no está disponible. Revisa los permisos de la aplicación web de Google.')
  let data: ListaSuscriptores & { ok: boolean; error?: string }
  try { data = await response.json() } catch { throw new Error('El Apps Script aún no tiene instalada la versión de suscriptores.') }
  if (!data.ok) throw new Error(data.error || 'No se pudo leer la lista de suscriptores.')
  if (!Array.isArray(data.suscriptores) || !data.servicio || typeof data.servicio.activo !== 'boolean' ||
      data.suscriptores.some(s => typeof s.email !== 'string' || typeof s.nombre !== 'string' || typeof s.fecha !== 'string' ||
        !['pendiente', 'activo', 'baja', 'retirado'].includes(s.estado)))
    throw new Error('El servicio devolvió una lista no válida.')
  return { suscriptores: data.suscriptores, servicio: data.servicio }
}
