import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface EntradaCatalogo {
  /** La clave. No cambia nunca, ni aunque cambie el slug. */
  id: string
  /** La URL: drluisangeldiaz.com/<slug>. Única en todo el catálogo. */
  slug: string
  /** El .md de content/posts/ que tiene el contenido. */
  archivo: string
}

export const RUTA_CATALOGO = path.join('content', 'reflexiones.json')

function archivo(repoPath: string): string {
  return path.join(repoPath, RUTA_CATALOGO)
}

export async function leerCatalogo(repoPath: string): Promise<EntradaCatalogo[]> {
  try {
    const { reflexiones } = JSON.parse(await readFile(archivo(repoPath), 'utf-8'))
    return Array.isArray(reflexiones) ? reflexiones : []
  } catch {
    return []
  }
}

async function escribirCatalogo(repoPath: string, entradas: EntradaCatalogo[]): Promise<void> {
  const ordenadas = [...entradas].sort((a, b) => a.archivo.localeCompare(b.archivo))
  await writeFile(
    archivo(repoPath),
    JSON.stringify({ reflexiones: ordenadas }, null, 2) + '\n',
    'utf-8'
  )
}

/**
 * Un slug libre a partir del propuesto, añadiendo un índice si hace falta:
 * `la-oracion`, `la-oracion-2`, `la-oracion-3`…
 *
 * La comprobación anterior solo miraba si existía el archivo
 * `<fecha>-<slug>.md`, o sea que era por día: publicar la misma reflexión otro
 * día colaba, y el prerender acababa escribiendo las dos en la misma ruta y
 * pisando una con otra sin avisar. Así llegaron a convivir diez pares.
 */
export async function slugUnico(repoPath: string, propuesto: string): Promise<string> {
  const usados = new Set((await leerCatalogo(repoPath)).map((r) => r.slug))
  if (!usados.has(propuesto)) return propuesto

  for (let i = 2; i < 1000; i++) {
    const candidato = `${propuesto}-${i}`
    if (!usados.has(candidato)) return candidato
  }
  throw new Error(`No se pudo encontrar una dirección libre para "${propuesto}".`)
}

/** Da de alta una reflexión. El id nace del slug: legible y ya único. */
export async function registrarReflexion(
  repoPath: string,
  entrada: EntradaCatalogo
): Promise<void> {
  const catalogo = await leerCatalogo(repoPath)
  if (catalogo.some((r) => r.slug === entrada.slug)) {
    throw new Error(`El slug "${entrada.slug}" ya está en uso.`)
  }
  await escribirCatalogo(repoPath, [...catalogo, entrada])
}

/** Quita una reflexión del catálogo. Devuelve false si no estaba. */
export async function olvidarReflexion(repoPath: string, nombreArchivo: string): Promise<boolean> {
  const catalogo = await leerCatalogo(repoPath)
  const restantes = catalogo.filter((r) => r.archivo !== nombreArchivo)
  if (restantes.length === catalogo.length) return false
  await escribirCatalogo(repoPath, restantes)
  return true
}
