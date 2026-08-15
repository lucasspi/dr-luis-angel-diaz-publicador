import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { extractText } from './docExtract'
import { formatearConCodex } from './codexFormat'
import { generarImagen } from './imageGen'
import { escribirPost } from './writePost'
import { publicar } from './publish'
import type { AppConfig } from './config'

function hoyISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function procesarDocumento(
  filePath: string,
  config: AppConfig,
  ventana: BrowserWindow
): Promise<{ url: string }> {
  const avisar = (msg: string): void => {
    ventana.webContents.send('progreso', msg)
  }

  avisar('Leyendo el documento…')
  const textoBruto = await extractText(filePath)
  if (textoBruto.length < 20) {
    throw new Error('El documento parece estar vacío o no se pudo leer el texto.')
  }

  avisar('Escribiendo la reflexión…')
  const formateada = await formatearConCodex(textoBruto)

  const fecha = hoyISO()
  const imagenRelativa = `/img/${formateada.slug}.jpg`
  const imagenAbsoluta = path.join(config.repoPath, 'public', 'img', `${formateada.slug}.jpg`)

  avisar('Generando la imagen de portada…')
  await generarImagen(formateada.image_prompt, config.falApiKey, imagenAbsoluta)

  avisar('Guardando la reflexión…')
  const { mdPath } = await escribirPost(config.repoPath, {
    titulo: formateada.titulo,
    fecha,
    versiculo: formateada.versiculo,
    resumen: formateada.resumen,
    slug: formateada.slug,
    cuerpo_markdown: formateada.cuerpo_markdown,
    imagenRelativa
  })

  avisar('Publicando…')
  await publicar(config.repoPath, formateada.titulo, [
    path.relative(config.repoPath, mdPath),
    path.relative(config.repoPath, imagenAbsoluta)
  ])

  return { url: `https://drluisangeldiaz.com/${formateada.slug}` }
}
