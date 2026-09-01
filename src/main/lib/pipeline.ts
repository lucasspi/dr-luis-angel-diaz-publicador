import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { detectarFechaDocumento, extractDocument } from './docExtract'
import { formatearConCodex } from './codexFormat'
import { generarImagen } from './imageGen'
import { escribirPost } from './writePost'
import { asegurarTema, RUTA_TEMAS } from './temas'
import { registrarReflexion, RUTA_CATALOGO, slugUnico } from './reflexiones'
import { publicar } from './publish'
import type { AppConfig } from './config'
import type { ReflexionFormateada } from './codexFormat'

export type AvisarProgreso = (mensaje: string) => void

export interface DocumentoPreparado {
  formateada: ReflexionFormateada
  fecha: string
  slug: string
  imagenRelativa: string
  imagenAbsoluta: string
}

export async function procesarDocumento(
  filePath: string,
  categoria: string,
  config: AppConfig,
  ventana: BrowserWindow
): Promise<{ url: string }> {
  const avisar = (msg: string): void => {
    ventana.webContents.send('progreso', msg)
  }

  const preparado = await prepararDocumento(
    filePath,
    config,
    (propuesto) => slugUnico(config.repoPath, propuesto),
    avisar
  )
  return publicarDocumentoPreparado(preparado, categoria, config, avisar)
}

export async function prepararDocumento(
  filePath: string,
  config: AppConfig,
  reservarSlug: (propuesto: string) => Promise<string> | string,
  avisar: AvisarProgreso
): Promise<DocumentoPreparado> {

  avisar('Leyendo el documento…')
  const { texto: textoBruto, fechaMetadatos } = await extractDocument(filePath)
  if (textoBruto.length < 20) {
    throw new Error('El documento parece estar vacío o no se pudo leer el texto.')
  }

  const { fecha, origen } = await detectarFechaDocumento(filePath, textoBruto, fechaMetadatos)
  avisar(`Fecha detectada: ${fecha} (${origen})`)

  avisar('Escribiendo la reflexión…')
  const formateada = await formatearConCodex(textoBruto)

  // La dirección se reserva antes de escribir nada: si ya existe una reflexión
  // con ese slug (aunque sea de otro día), esta se lleva un índice al final.
  const slug = await reservarSlug(formateada.slug)
  const imagenRelativa = `/img/${slug}.jpg`
  const imagenAbsoluta = path.join(config.repoPath, 'public', 'img', `${slug}.jpg`)

  avisar('Generando la imagen de portada…')
  await generarImagen(formateada.image_prompt, config.falApiKey, imagenAbsoluta)

  return { formateada, fecha, slug, imagenRelativa, imagenAbsoluta }
}

export async function publicarDocumentoPreparado(
  preparado: DocumentoPreparado,
  categoria: string,
  config: AppConfig,
  avisar: AvisarProgreso
): Promise<{ url: string }> {
  const { formateada, fecha, slug, imagenRelativa, imagenAbsoluta } = preparado

  avisar('Guardando la reflexión…')
  // El tema se referencia por id. Si es uno nuevo, se da de alta en el
  // registro y ese archivo entra en el mismo commit que la reflexión — así el
  // sitio nunca ve un post apuntando a un tema que todavía no existe.
  const { id: temaId, creado: temaNuevo } = await asegurarTema(config.repoPath, categoria)

  const { mdPath } = await escribirPost(config.repoPath, {
    titulo: formateada.titulo,
    fecha,
    temaId,
    versiculo: formateada.versiculo,
    resumen: formateada.resumen,
    slug,
    cuerpo_markdown: formateada.cuerpo_markdown,
    imagenRelativa
  })

  await registrarReflexion(config.repoPath, {
    id: slug,
    slug,
    archivo: path.basename(mdPath)
  })

  avisar('Publicando…')
  const archivos = [
    path.relative(config.repoPath, mdPath),
    path.relative(config.repoPath, imagenAbsoluta),
    RUTA_CATALOGO
  ]
  if (temaNuevo) archivos.push(RUTA_TEMAS)
  await publicar(config.repoPath, formateada.titulo, archivos)

  return { url: `https://drluisangeldiaz.com/${slug}` }
}
