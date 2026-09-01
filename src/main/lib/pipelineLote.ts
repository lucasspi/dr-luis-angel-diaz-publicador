import type { AppConfig } from './config'
import { sincronizar } from './git'
import { leerCatalogo } from './reflexiones'
import {
  prepararDocumento,
  publicarDocumentoPreparado,
  type DocumentoPreparado
} from './pipeline'

const CONCORRENCIA_PREPARACAO = 3

export type EventoProgresoLote =
  | { tipo: 'progreso'; filePath: string; mensaje: string; porcentaje: number }
  | { tipo: 'exito'; filePath: string; url: string }
  | { tipo: 'erro'; filePath: string; mensaje: string }

export type ResultadoDocumentoLote =
  | { filePath: string; status: 'exito'; url: string }
  | { filePath: string; status: 'erro'; mensaje: string }

type Preparacion =
  | { preparado: DocumentoPreparado }
  | { erro: string }

function porcentajePara(mensaje: string): number {
  if (mensaje.startsWith('Leyendo')) return 10
  if (mensaje.startsWith('Fecha detectada')) return 20
  if (mensaje.startsWith('Escribiendo')) return 30
  if (mensaje.startsWith('Generando')) return 55
  if (mensaje.startsWith('Guardando')) return 82
  if (mensaje.startsWith('Publicando')) return 94
  return 5
}

function mensajeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function procesarDocumentosEnLote(
  filePaths: string[],
  categoria: string,
  config: AppConfig,
  emitir: (evento: EventoProgresoLote) => void
): Promise<ResultadoDocumentoLote[]> {
  if (filePaths.length === 0) return []
  if (filePaths.length > 10) {
    throw new Error('Puedes publicar un máximo de 10 documentos por vez.')
  }

  await sincronizar(config.repoPath)

  // Todos los slugs del lote se reservan en memoria. JavaScript ejecuta esta
  // función síncrona de una vez, así que dos preparaciones que terminan casi al
  // mismo tiempo nunca reciben la misma dirección.
  const usados = new Set((await leerCatalogo(config.repoPath)).map((item) => item.slug))
  const reservarSlug = (propuesto: string): string => {
    let candidato = propuesto
    for (let indice = 2; usados.has(candidato); indice += 1) {
      candidato = `${propuesto}-${indice}`
    }
    usados.add(candidato)
    return candidato
  }

  const preparaciones: Array<Preparacion | undefined> = new Array(filePaths.length)
  let proximoIndice = 0

  async function trabajador(): Promise<void> {
    while (true) {
      const indice = proximoIndice
      proximoIndice += 1
      if (indice >= filePaths.length) return

      const filePath = filePaths[indice]
      try {
        const preparado = await prepararDocumento(filePath, config, reservarSlug, (mensaje) => {
          emitir({
            tipo: 'progreso',
            filePath,
            mensaje,
            porcentaje: porcentajePara(mensaje)
          })
        })
        preparaciones[indice] = { preparado }
        emitir({
          tipo: 'progreso',
          filePath,
          mensaje: 'En espera para publicar…',
          porcentaje: 75
        })
      } catch (err) {
        const mensaje = mensajeError(err)
        preparaciones[indice] = { erro: mensaje }
        emitir({ tipo: 'erro', filePath, mensaje })
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CONCORRENCIA_PREPARACAO, filePaths.length) },
      () => trabajador()
    )
  )

  // Catálogo, temas e índice Git são recursos compartilhados. Esta parte fica
  // intencionalmente serial, enquanto a parte demorada acima roda em paralelo.
  const resultados: ResultadoDocumentoLote[] = []
  for (let indice = 0; indice < filePaths.length; indice += 1) {
    const filePath = filePaths[indice]
    const preparacion = preparaciones[indice]
    if (!preparacion || 'erro' in preparacion) {
      resultados.push({
        filePath,
        status: 'erro',
        mensaje: preparacion?.erro ?? 'No se pudo preparar el documento.'
      })
      continue
    }

    try {
      const { url } = await publicarDocumentoPreparado(
        preparacion.preparado,
        categoria,
        config,
        (mensaje) => {
          emitir({
            tipo: 'progreso',
            filePath,
            mensaje,
            porcentaje: porcentajePara(mensaje)
          })
        }
      )
      const resultado: ResultadoDocumentoLote = { filePath, status: 'exito', url }
      resultados.push(resultado)
      emitir({ tipo: 'exito', filePath, url })
    } catch (err) {
      const mensaje = mensajeError(err)
      resultados.push({ filePath, status: 'erro', mensaje })
      emitir({ tipo: 'erro', filePath, mensaje })
    }
  }

  return resultados
}
