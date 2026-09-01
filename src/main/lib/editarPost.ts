import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import yaml from 'js-yaml'

/**
 * Cambia el título de una reflexión. Solo el título: el archivo no se renombra
 * y el slug del catálogo no se toca, así que la URL no se mueve y nadie pierde
 * el enlace que tenía. Es la misma decisión que con el nombre de un tema.
 *
 * Se reescribe **solo la línea** de `titulo`, no el frontmatter entero. Volver
 * a serializarlo cambia lo que no se pidió: en la migración de temas convirtió
 * tres fechas sin comillas en timestamps ISO y replegó los resúmenes largos.
 *
 * El valor lo emite js-yaml y no una plantilla a mano — los títulos llevan dos
 * puntos, comillas angulares y apóstrofos, y cada uno pide un entrecomillado
 * distinto. `lineWidth: -1` evita que un título largo se parta en dos líneas,
 * que rompería la sustitución de una sola línea.
 */
export async function cambiarTitulo(
  repoPath: string,
  archivo: string,
  tituloNuevo: string
): Promise<{ archivo: string; titulo: string }> {
  if (path.basename(archivo) !== archivo || !archivo.endsWith('.md')) {
    throw new Error(`Nombre de archivo no válido: "${archivo}".`)
  }

  const limpio = tituloNuevo.trim()
  if (!limpio) throw new Error('El título no puede quedar vacío.')

  const ruta = path.join(repoPath, 'content', 'posts', archivo)
  let bruto: string
  try {
    bruto = await readFile(ruta, 'utf-8')
  } catch {
    throw new Error(
      `La reflexión "${archivo}" ya no está en el repositorio. Sincroniza y vuelve a mirar.`
    )
  }

  if (String(matter(bruto).data?.titulo ?? '').trim() === limpio) {
    throw new Error('El título es el mismo que ya tenía.')
  }

  const fin = bruto.indexOf('\n---', 4)
  if (!bruto.startsWith('---\n') || fin < 0) {
    throw new Error(`El frontmatter de "${archivo}" no tiene el formato esperado.`)
  }
  const cabeza = bruto.slice(0, fin)
  const cola = bruto.slice(fin)

  // Un título puede ocupar varias líneas si estaba plegado (`>-`), así que la
  // línea de `titulo` se toma hasta la siguiente clave del frontmatter.
  const re = /^titulo:.*(?:\n[ \t]+.*)*$/m
  if (!re.test(cabeza)) {
    throw new Error(`"${archivo}" no tiene una línea de título que se pueda reescribir.`)
  }

  const linea = yaml.dump({ titulo: limpio }, { lineWidth: -1 }).trimEnd()
  if (linea.includes('\n')) {
    throw new Error('Ese título no se puede guardar en una sola línea. Prueba con uno más corto.')
  }

  await writeFile(ruta, cabeza.replace(re, linea) + cola, 'utf-8')
  return { archivo, titulo: limpio }
}
