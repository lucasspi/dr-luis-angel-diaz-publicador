import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { git } from './git'
import { olvidarReflexion, RUTA_CATALOGO } from './reflexiones'

export interface ResultadoBorrado {
  archivo: string
  /** La portada, si se fue con la reflexión. Vacío si se quedó. */
  imagenBorrada: string
  /** Por qué la portada se quedó: la usan estos otros posts. */
  imagenCompartidaCon: string[]
}

/**
 * Borra una reflexión del sitio: quita el .md del repo, y su portada solo si
 * ningún otro post la usa.
 *
 * Se identifica por nombre de archivo y no por slug a propósito. Hay pares de
 * reflexiones que comparten slug (mismo título, fechas distintas), así que el
 * slug no distingue una de otra — borrar "por slug" sería una ruleta.
 */
export async function borrarPublicacion(
  repoPath: string,
  archivo: string
): Promise<ResultadoBorrado> {
  // El nombre viene del renderer: nada de subir por el árbol ni salir de posts/.
  if (path.basename(archivo) !== archivo || !archivo.endsWith('.md')) {
    throw new Error(`Nombre de archivo no válido: "${archivo}".`)
  }

  const dirPosts = path.join(repoPath, 'content', 'posts')
  const rutaMd = path.join(dirPosts, archivo)

  let bruto: string
  try {
    bruto = await readFile(rutaMd, 'utf-8')
  } catch {
    throw new Error(
      `La reflexión "${archivo}" ya no está en el repositorio. Puede que se haya borrado desde otro sitio — sincroniza y vuelve a mirar.`
    )
  }

  const imagen = String(matter(bruto).data?.imagen ?? '').trim()

  // Diez portadas están compartidas por dos posts. Borrar la imagen a ciegas
  // dejaría al otro post sin ella.
  const compartidaCon: string[] = []
  if (imagen) {
    for (const otro of await readdir(dirPosts)) {
      if (otro === archivo || !otro.endsWith('.md')) continue
      try {
        const { data } = matter(await readFile(path.join(dirPosts, otro), 'utf-8'))
        if (String(data?.imagen ?? '').trim() === imagen) compartidaCon.push(otro)
      } catch {
        // un .md ilegible no debe impedir el borrado
      }
    }
  }

  const borrarImagen = imagen !== '' && compartidaCon.length === 0
  const aQuitar = [path.join('content', 'posts', archivo)]
  if (borrarImagen) aQuitar.push(path.join('public', imagen.replace(/^\//, '')))

  // --ignore-unmatch: si la portada ya no estaba en disco, el borrado del .md
  // no debe fallar por eso.
  await git(['rm', '--quiet', '--ignore-unmatch', ...aQuitar], repoPath)

  // El catálogo tiene que irse con ella: una entrada apuntando a un .md que ya
  // no existe rompe el build del sitio a propósito.
  if (await olvidarReflexion(repoPath, archivo)) {
    await git(['add', RUTA_CATALOGO], repoPath)
  }

  return {
    archivo,
    imagenBorrada: borrarImagen ? imagen : '',
    imagenCompartidaCon: compartidaCon
  }
}
