import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

export interface DatosPost {
  titulo: string
  fecha: string
  /** Id del tema en content/temas.json, no su nombre. */
  temaId: string
  versiculo: string
  resumen: string
  slug: string
  cuerpo_markdown: string
  imagenRelativa: string
  comunicar?: boolean
  /**
   * La versión en portugués, si la hay. Va a content/posts/pt/<mismo nombre>.md
   * con solo lo que cambia de idioma: título, resumen, versículo y cuerpo.
   * Fecha, tema, imagen, publicado y comunicar viven únicamente en el .md en
   * español; el sitio los hereda. Sin `pt`, la reflexión existe solo en español.
   *
   * Es una carpeta aparte y no un sufijo (`.pt.md`) a propósito: todo lo que
   * lee content/posts/ — el build del sitio, la lista de publicaciones, el
   * borrado — filtra por `.endsWith('.md')` sobre un readdir sin recursión, y
   * un sufijo colaría como una reflexión más. Una carpeta es invisible para
   * todo eso, incluidas las versiones anteriores del sitio y de esta app.
   */
  pt?: {
    titulo: string
    versiculo: string
    resumen: string
    cuerpo_markdown: string
  }
}

export const DIR_PT = path.join('content', 'posts', 'pt')

export async function escribirPost(
  repoPath: string,
  datos: DatosPost
): Promise<{ mdPath: string; mdPathPt: string | null; slug: string }> {
  const nombreArchivo = `${datos.fecha}-${datos.slug}.md`
  const mdPath = path.join(repoPath, 'content', 'posts', nombreArchivo)

  if (await existe(mdPath)) {
    throw new Error(
      `Ya existe una reflexión con el slug "${datos.slug}" para hoy (${datos.fecha}). Ajusta el título e intenta de nuevo.`
    )
  }

  const frontmatter: Record<string, unknown> = {
    titulo: datos.titulo,
    fecha: datos.fecha,
    publicado: true,
    comunicar: datos.comunicar === true,
    resumen: datos.resumen
  }
  if (datos.temaId) frontmatter.tema = datos.temaId
  if (datos.versiculo) frontmatter.versiculo = datos.versiculo
  if (datos.imagenRelativa) frontmatter.imagen = datos.imagenRelativa

  const contenido = matter.stringify(`${datos.cuerpo_markdown.trim()}\n`, frontmatter)

  await mkdir(path.dirname(mdPath), { recursive: true })
  await writeFile(mdPath, contenido, 'utf-8')

  let mdPathPt: string | null = null
  if (datos.pt) {
    const frontmatterPt: Record<string, unknown> = {
      titulo: datos.pt.titulo,
      resumen: datos.pt.resumen
    }
    if (datos.pt.versiculo) frontmatterPt.versiculo = datos.pt.versiculo
    mdPathPt = path.join(repoPath, DIR_PT, nombreArchivo)
    await mkdir(path.dirname(mdPathPt), { recursive: true })
    await writeFile(mdPathPt, matter.stringify(`${datos.pt.cuerpo_markdown.trim()}\n`, frontmatterPt), 'utf-8')
  }

  return { mdPath, mdPathPt, slug: datos.slug }
}

async function existe(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}
