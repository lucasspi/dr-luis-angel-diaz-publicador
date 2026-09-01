import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { urlImagen } from './imagenes'
import { slugificarCategoria } from './slug'
import { leerTemas, type Tema } from './temas'
import { leerCatalogo } from './reflexiones'

export interface Publicacion {
  /** Id en el catálogo — la clave estable, no la URL. */
  id: string
  slug: string
  titulo: string
  fecha: string
  /** Id del tema en el registro — la clave estable, no la etiqueta. */
  temaId: string
  categoria: string
  /** El slug con el que el sitio publica /categoria/{slug}. */
  categoriaSlug: string
  resumen: string
  imagen: string
  /** URL con la que el renderer carga la portada (esquema propio). */
  thumbUrl: string
  url: string
  archivo: string
}

const BASE_URL = 'https://drluisangeldiaz.com'

// El nombre del archivo es AAAA-MM-DD-slug-del-titulo.md y la URL usa solo el
// slug (ver content/README.md del sitio, que es el contrato).
function slugDesdeArchivo(archivo: string): string {
  return archivo.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

// `fecha` viene del frontmatter, donde puede ser string ('2026-09-01') o una
// Date ya parseada por el YAML cuando va sin comillas. Normalizamos a ISO
// corto para poder ordenar y mostrar sin sorpresas.
function fechaISO(valor: unknown, archivo: string): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10)
  const delNombre = archivo.match(/^(\d{4}-\d{2}-\d{2})/)
  return delNombre ? delNombre[1] : ''
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

/**
 * El tema de un post, venga en el formato nuevo (`tema: <id>`) o en el viejo
 * (`categoria: "<nombre>"`). Espeja a `resolverTema` de content/loader.mjs del
 * sitio: las dos lecturas tienen que coincidir o el app enseñaría un tema y el
 * sitio otro.
 */
function resolverTema(
  data: Record<string, unknown> | undefined,
  porId: Map<string, Tema>,
  porSlug: Map<string, Tema>
): Tema | null {
  const id = texto(data?.tema)
  if (id) return porId.get(id) ?? null

  const nombre = texto(data?.categoria)
  if (!nombre) return null
  const slug = slugificarCategoria(nombre)
  return porSlug.get(slug) ?? { id: slug, nombre, slug }
}

/**
 * Las reflexiones que están en el sitio, leídas del clone local — las mismas
 * que el build convierte en páginas. Solo las publicadas: `publicado: false`
 * es un borrador y no existe para el visitante.
 *
 * Refleja el clone, no el servidor. Quien quiera la foto de ahora mismo pasa
 * por `sincronizar` antes (el botón "Sincronizar" de la lista).
 */
export async function listarPublicaciones(repoPath: string): Promise<Publicacion[]> {
  const dir = path.join(repoPath, 'content', 'posts')
  let archivos: string[] = []
  try {
    archivos = await readdir(dir)
  } catch {
    return []
  }

  const temas = await leerTemas(repoPath)
  // La URL sale del catálogo, igual que en el sitio: derivarla del nombre del
  // archivo por segunda vez sería otra fuente que puede discrepar.
  const porArchivo = new Map((await leerCatalogo(repoPath)).map((r) => [r.archivo, r]))
  const porId = new Map(temas.map((t) => [t.id, t]))
  const porSlug = new Map(temas.map((t) => [t.slug, t]))

  const publicaciones: Publicacion[] = []
  for (const archivo of archivos) {
    if (!archivo.endsWith('.md')) continue
    try {
      const { data } = matter(await readFile(path.join(dir, archivo), 'utf-8'))
      if (data?.publicado === false) continue

      const entrada = porArchivo.get(archivo)
      const slug = entrada?.slug ?? slugDesdeArchivo(archivo)
      const imagen = texto(data?.imagen)
      const tema = resolverTema(data, porId, porSlug)
      publicaciones.push({
        id: entrada?.id ?? slug,
        slug,
        titulo: texto(data?.titulo) || slug,
        fecha: fechaISO(data?.fecha, archivo),
        temaId: tema?.id ?? '',
        categoria: tema?.nombre ?? '',
        categoriaSlug: tema?.slug ?? '',
        resumen: texto(data?.resumen),
        imagen,
        thumbUrl: urlImagen(imagen),
        url: `${BASE_URL}/${slug}`,
        archivo
      })
    } catch {
      // un .md malformado no debe tumbar la lista entera
    }
  }

  // Más recientes arriba; a igual fecha, alfabético para que el orden sea estable.
  return publicaciones.sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || a.titulo.localeCompare(b.titulo, 'es')
  )
}
