import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

export interface DatosPost {
  titulo: string
  fecha: string
  versiculo: string
  resumen: string
  slug: string
  cuerpo_markdown: string
  imagenRelativa: string
}

export async function escribirPost(
  repoPath: string,
  datos: DatosPost
): Promise<{ mdPath: string; slug: string }> {
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
    resumen: datos.resumen
  }
  if (datos.versiculo) frontmatter.versiculo = datos.versiculo
  if (datos.imagenRelativa) frontmatter.imagen = datos.imagenRelativa

  const contenido = matter.stringify(`${datos.cuerpo_markdown.trim()}\n`, frontmatter)

  await mkdir(path.dirname(mdPath), { recursive: true })
  await writeFile(mdPath, contenido, 'utf-8')

  return { mdPath, slug: datos.slug }
}

async function existe(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}
