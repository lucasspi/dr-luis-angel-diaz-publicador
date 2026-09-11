import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'

/**
 * La fecha de publicación es siempre la de hoy — el día en que el Dr. Luis
 * publica desde la app.
 *
 * Hubo una versión (0.3.0) que intentaba adivinar la fecha del documento
 * (nombre del archivo, una fecha escrita al comienzo del texto, metadatos del
 * Word/PDF, fecha de creación en disco) y la usaba como fecha de publicación.
 * Resultó una mala idea: una fecha citada en el texto o un Word reciclado de
 * otro año mandaba la reflexión nueva al fondo del índice, sin aviso. Para
 * publicar documentos históricos con su fecha original existe
 * scripts/publicar-lote.mjs, que pide la fecha explícita en el manifest.
 */
export function hoyISO(): string {
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

export async function extractDocument(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.docx') {
    const buffer = await readFile(filePath)
    const { value } = await mammoth.extractRawText({ buffer })
    return value.trim()
  }

  if (ext === '.pdf') {
    const buffer = await readFile(filePath)
    const resultado = await pdfParse(buffer)
    return resultado.text.trim()
  }

  if (ext === '.doc') {
    throw new Error('Los archivos .doc antiguos no son compatibles. Guarda el documento como .docx y vuelve a intentar.')
  }

  throw new Error(`Formato no soportado: "${ext || '(sin extensión)'}". Usa un archivo .docx o .pdf.`)
}
