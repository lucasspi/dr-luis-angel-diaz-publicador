import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'

export interface DocumentoExtraido {
  texto: string
  fechaMetadatos: string
}

export interface FechaDocumento {
  fecha: string
  origen: 'nombre del archivo' | 'contenido' | 'metadatos' | 'archivo' | 'fecha actual'
}

const MESES: Record<string, number> = {
  enero: 1,
  janeiro: 1,
  january: 1,
  febrero: 2,
  fevereiro: 2,
  february: 2,
  marzo: 3,
  marco: 3,
  march: 3,
  abril: 4,
  april: 4,
  mayo: 5,
  maio: 5,
  may: 5,
  junio: 6,
  junho: 6,
  june: 6,
  julio: 7,
  julho: 7,
  july: 7,
  agosto: 8,
  august: 8,
  septiembre: 9,
  setiembre: 9,
  setembro: 9,
  september: 9,
  octubre: 10,
  outubro: 10,
  october: 10,
  noviembre: 11,
  novembro: 11,
  november: 11,
  diciembre: 12,
  dezembro: 12,
  december: 12
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function fechaValida(anio: number, mes: number, dia: number): string | null {
  const maximo = new Date().getFullYear() + 1
  if (anio < 1900 || anio > maximo) return null
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null
  }
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function buscarFechaEnTexto(texto: string): string | null {
  const limpio = normalizar(texto)
  const nombresMes = Object.keys(MESES).join('|')
  const conMes = limpio.match(
    new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${nombresMes})\\s*(?:de\\s+)?(\\d{4})\\b`, 'i')
  )
  if (conMes) {
    return fechaValida(Number(conMes[3]), MESES[conMes[2]], Number(conMes[1]))
  }

  const anioPrimero = limpio.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (anioPrimero) {
    return fechaValida(Number(anioPrimero[1]), Number(anioPrimero[2]), Number(anioPrimero[3]))
  }

  const diaPrimero = limpio.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/)
  if (diaPrimero) {
    return fechaValida(Number(diaPrimero[3]), Number(diaPrimero[2]), Number(diaPrimero[1]))
  }
  return null
}

function fechaDesdeMetadatos(valor: string): string | null {
  if (!valor) return null
  const pdf = valor.match(/^D:?(\d{4})(\d{2})(\d{2})/)
  if (pdf) return fechaValida(Number(pdf[1]), Number(pdf[2]), Number(pdf[3]))

  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return null
  return fechaValida(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate())
}

function hoyISO(): string {
  const hoy = new Date()
  return fechaValida(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate())!
}

export async function detectarFechaDocumento(
  filePath: string,
  texto: string,
  fechaMetadatos: string
): Promise<FechaDocumento> {
  const desdeNombre = buscarFechaEnTexto(path.basename(filePath, path.extname(filePath)))
  if (desdeNombre) return { fecha: desdeNombre, origen: 'nombre del archivo' }

  // Solo se mira el comienzo: ahí suelen estar el título y la fecha. Así se
  // evita confundir una fecha histórica mencionada dentro de la reflexión.
  const desdeContenido = buscarFechaEnTexto(texto.slice(0, 800))
  if (desdeContenido) return { fecha: desdeContenido, origen: 'contenido' }

  const desdeMetadatos = fechaDesdeMetadatos(fechaMetadatos)
  if (desdeMetadatos) return { fecha: desdeMetadatos, origen: 'metadatos' }

  try {
    const datos = await stat(filePath)
    if (datos.birthtimeMs > 0) {
      const desdeArchivo = fechaValida(
        datos.birthtime.getFullYear(),
        datos.birthtime.getMonth() + 1,
        datos.birthtime.getDate()
      )
      if (desdeArchivo) return { fecha: desdeArchivo, origen: 'archivo' }
    }
  } catch {
    // Si el archivo desapareció después de abrirlo, el pipeline fallará al
    // leerlo; la fecha no necesita ocultar ese error más claro.
  }

  return { fecha: hoyISO(), origen: 'fecha actual' }
}

export async function extractDocument(filePath: string): Promise<DocumentoExtraido> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.docx') {
    const buffer = await readFile(filePath)
    const [{ value }, zip] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      JSZip.loadAsync(buffer)
    ])
    const core = await zip.file('docProps/core.xml')?.async('string')
    const creada = core?.match(/<dcterms:created[^>]*>([^<]+)<\/dcterms:created>/i)?.[1]
    const modificada = core?.match(/<dcterms:modified[^>]*>([^<]+)<\/dcterms:modified>/i)?.[1]
    return { texto: value.trim(), fechaMetadatos: creada ?? modificada ?? '' }
  }

  if (ext === '.pdf') {
    const buffer = await readFile(filePath)
    const resultado = await pdfParse(buffer)
    const info = resultado.info as Record<string, unknown> | undefined
    const fecha = info?.CreationDate ?? info?.ModDate
    return { texto: resultado.text.trim(), fechaMetadatos: typeof fecha === 'string' ? fecha : '' }
  }

  if (ext === '.doc') {
    throw new Error('Los archivos .doc antiguos no son compatibles. Guarda el documento como .docx y vuelve a intentar.')
  }

  throw new Error(`Formato no soportado: "${ext || '(sin extensión)'}". Usa un archivo .docx o .pdf.`)
}
