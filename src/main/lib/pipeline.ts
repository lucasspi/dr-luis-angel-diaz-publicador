import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { extractText } from './docExtract'
import { formatearConCodex } from './codexFormat'
import { generarImagen } from './imageGen'
import { escribirPost } from './writePost'
import { asegurarTema, RUTA_TEMAS } from './temas'
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
  categoria: string,
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
    slug: formateada.slug,
    cuerpo_markdown: formateada.cuerpo_markdown,
    imagenRelativa
  })

  avisar('Publicando…')
  const archivos = [
    path.relative(config.repoPath, mdPath),
    path.relative(config.repoPath, imagenAbsoluta)
  ]
  if (temaNuevo) archivos.push(RUTA_TEMAS)
  await publicar(config.repoPath, formateada.titulo, archivos)

  return { url: `https://drluisangeldiaz.com/${formateada.slug}` }
}
