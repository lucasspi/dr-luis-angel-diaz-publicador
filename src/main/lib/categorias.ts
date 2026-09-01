import { leerTemas } from './temas'
import { slugificarCategoria } from './slug'

// Temas que siempre se ofrecen como chips, aunque ningún post los use aún —
// el repertorio típico de un pastor. Solo entran de verdad en el registro
// (content/temas.json) cuando una reflexión los estrena.
const CATEGORIAS_SUGERIDAS = [
  'Ministerio',
  'Oración',
  'Liderazgo',
  'Familia',
  'Fe',
  'Vida Cristiana',
  'Predicación'
]

/**
 * Los nombres de tema que se ofrecen al soltar un documento: los del registro
 * (para que el Dr. Luis reutilice en vez de inventar variantes sin querer),
 * más las sugerencias que todavía nadie ha usado.
 *
 * Devuelve nombres y no ids a propósito: al publicar se escribe lo que él
 * eligió o tecleó, y `asegurarTema` se encarga de traducirlo a un id — dando
 * de alta el tema si hace falta.
 */
export async function listarCategorias(repoPath: string): Promise<string[]> {
  const porClave = new Map<string, string>()

  for (const tema of await leerTemas(repoPath)) {
    if (tema.nombre?.trim()) porClave.set(tema.slug, tema.nombre.trim())
  }

  for (const sugerida of CATEGORIAS_SUGERIDAS) {
    const clave = slugificarCategoria(sugerida)
    if (!porClave.has(clave)) porClave.set(clave, sugerida)
  }

  return [...porClave.values()].sort((a, b) => a.localeCompare(b, 'es'))
}
