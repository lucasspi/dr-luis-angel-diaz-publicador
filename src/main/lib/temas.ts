import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { slugificarCategoria } from './slug'

export interface Tema {
  /** La clave. Es lo que el frontmatter referencia. No cambia nunca. */
  id: string
  /** La etiqueta que ve el lector. Es lo único que edita un renombrado. */
  nombre: string
  /** La URL: /categoria/<slug>. Se queda quieta aunque cambie el nombre. */
  slug: string
}

export const RUTA_TEMAS = path.join('content', 'temas.json')

function archivo(repoPath: string): string {
  return path.join(repoPath, RUTA_TEMAS)
}

export async function leerTemas(repoPath: string): Promise<Tema[]> {
  try {
    const { temas } = JSON.parse(await readFile(archivo(repoPath), 'utf-8'))
    return Array.isArray(temas) ? temas : []
  } catch {
    // Sin registro legible el app no se cae: se comporta como si no hubiera
    // temas todavía y el primero que se publique lo estrena.
    return []
  }
}

async function escribirTemas(repoPath: string, temas: Tema[]): Promise<void> {
  const ordenados = [...temas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  await writeFile(archivo(repoPath), JSON.stringify({ temas: ordenados }, null, 2) + '\n', 'utf-8')
}

/**
 * El id del tema que se llama `nombre`, dándolo de alta si aún no existe.
 *
 * La identidad se busca por slug y no por nombre exacto, para que "Oración" y
 * "oracion" no acaben siendo dos temas con la misma URL. Devuelve además si
 * hubo alta, porque entonces temas.json entra en el commit del post.
 */
export async function asegurarTema(
  repoPath: string,
  nombre: string
): Promise<{ id: string; creado: boolean }> {
  const limpio = nombre.trim()
  if (!limpio) return { id: '', creado: false }

  const slug = slugificarCategoria(limpio)
  if (!slug) return { id: '', creado: false }

  const temas = await leerTemas(repoPath)
  // Primero por slug (la URL), después por el nombre normalizado. Lo segundo
  // importa después de un renombrado: el slug se queda quieto pero el chip que
  // ve el Dr. Luis lleva el nombre nuevo, y si solo se mirara el slug cada
  // publicación siguiente daría de alta un tema repetido con el mismo nombre.
  const existente =
    temas.find((t) => t.slug === slug) ??
    temas.find((t) => slugificarCategoria(t.nombre) === slug)
  if (existente) return { id: existente.id, creado: false }

  // El id nace del slug: legible en el frontmatter y en los diffs. A partir de
  // aquí es opaco — que coincida con el slug hoy es una casualidad cómoda.
  const id = temas.some((t) => t.id === slug) ? `${slug}-${Date.now().toString(36)}` : slug
  await escribirTemas(repoPath, [...temas, { id, nombre: limpio, slug }])
  return { id, creado: true }
}

/**
 * Cambia la etiqueta de un tema. No toca `id` ni `slug`, así que ninguna
 * reflexión se reescribe y /categoria/<slug> sigue respondiendo donde estaba.
 */
export async function renombrarTema(
  repoPath: string,
  id: string,
  nombreNuevo: string
): Promise<Tema> {
  const limpio = nombreNuevo.trim()
  if (!limpio) throw new Error('El nombre no puede quedar vacío.')

  const temas = await leerTemas(repoPath)
  const tema = temas.find((t) => t.id === id)
  if (!tema) throw new Error(`No existe el tema "${id}" en el registro.`)

  // Mismo criterio de identidad que `asegurarTema`: dos temas chocan si sus
  // nombres normalizan al mismo slug o si el nombre nuevo cae sobre la URL de
  // otro tema. Comparar solo minúsculas dejaba pasar «Oración» vs «oracion».
  const slugNuevo = slugificarCategoria(limpio)
  const choque = temas.find(
    (t) => t.id !== id && (slugificarCategoria(t.nombre) === slugNuevo || t.slug === slugNuevo)
  )
  if (choque) {
    throw new Error(
      `Ya hay otro tema que se llama "${choque.nombre}". Dos temas con el mismo nombre serían indistinguibles en el sitio.`
    )
  }

  const renombrado: Tema = { ...tema, nombre: limpio }
  await escribirTemas(
    repoPath,
    temas.map((t) => (t.id === id ? renombrado : t))
  )
  return renombrado
}
