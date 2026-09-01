import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { slugificarCategoria as normalizar } from './slug'

// Temas que siempre se ofrecen como chips, aunque ningún post los use aún —
// el repertorio típico de un pastor. En el sitio una categoría solo gana
// página /categoria/{slug} cuando algún post publicado la usa.
const CATEGORIAS_SUGERIDAS = [
  'Ministerio',
  'Oración',
  'Liderazgo',
  'Familia',
  'Fe',
  'Vida Cristiana',
  'Predicación'
]

// Las categorías ofrecidas al soltar un documento: las que ya aparecen en el
// frontmatter de content/posts/*.md del clone local (su grafía gana, para que
// el Dr. Luis reutilice temas en vez de inventar variantes sin querer),
// más las sugeridas que aún no se hayan usado.
export async function listarCategorias(repoPath: string): Promise<string[]> {
  const dir = path.join(repoPath, 'content', 'posts')
  let archivos: string[] = []
  try {
    archivos = await readdir(dir)
  } catch {
    // sin clone legible, quedan solo las sugeridas
  }

  const porClave = new Map<string, string>()
  for (const archivo of archivos) {
    if (!archivo.endsWith('.md')) continue
    try {
      const parsed = matter(await readFile(path.join(dir, archivo), 'utf-8'))
      const categoria = parsed.data?.categoria
      if (typeof categoria === 'string' && categoria.trim()) {
        const limpia = categoria.trim()
        if (!porClave.has(normalizar(limpia))) porClave.set(normalizar(limpia), limpia)
      }
    } catch {
      // un .md malformado no debe tumbar la lista
    }
  }

  for (const sugerida of CATEGORIAS_SUGERIDAS) {
    const clave = normalizar(sugerida)
    if (!porClave.has(clave)) porClave.set(clave, sugerida)
  }

  return [...porClave.values()].sort((a, b) => a.localeCompare(b, 'es'))
}
