import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'

export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ path: filePath })
    return value.trim()
  }

  if (ext === '.pdf') {
    const buffer = await readFile(filePath)
    const { text } = await pdfParse(buffer)
    return text.trim()
  }

  if (ext === '.doc') {
    throw new Error('Los archivos .doc antiguos no son compatibles. Guarda el documento como .docx y vuelve a intentar.')
  }

  throw new Error(`Formato no soportado: "${ext || '(sin extensión)'}". Usa un archivo .docx o .pdf.`)
}
