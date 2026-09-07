import type { ParrafoOracion } from '../../../preload'

// Whisper offsets are milliseconds. Do not use token timestamps as paragraph times.
export function parrafosWhisper(raw: unknown, duracion: number): ParrafoOracion[] {
  const segmentos = (raw as { transcription?: unknown[] })?.transcription
  if (!Array.isArray(segmentos)) throw new Error('La transcripción no tiene un formato válido.')
  const resultado: ParrafoOracion[] = []
  let anterior = 0
  for (const segmento of segmentos) {
    const s = segmento as { offsets?: { from: number; to: number }; text?: string }
    if (typeof s.text !== 'string' || !s.offsets || !Number.isFinite(s.offsets.from) || !Number.isFinite(s.offsets.to)) throw new Error('La transcripción contiene tiempos inválidos.')
    const texto = s.text.replace(/\s+/g, ' ').trim()
    const inicio = s.offsets.from / 1000
    const fin = Math.min(s.offsets.to / 1000, duracion)
    if (inicio < anterior || inicio < 0 || fin <= inicio) throw new Error('La transcripción contiene tiempos fuera de orden.')
    anterior = fin
    if (!texto || /^\[.*\]$/.test(texto)) continue
    const previo = resultado[resultado.length - 1]
    // Natural pauses and completed sentences make short, readable paragraphs.
    if (previo && inicio - previo.fin < 1.2 && fin - previo.inicio <= 35 &&
        previo.texto.length + texto.length < 450 && !/[.!?…]$/.test(previo.texto)) {
      previo.fin = fin
      previo.texto += ` ${texto}`
    } else resultado.push({ inicio, fin, texto })
  }
  if (!resultado.length) throw new Error('No se detectó voz. Puedes publicar el audio sin texto.')
  return resultado
}

export function revisarParrafos(originales: ParrafoOracion[] | undefined, textos: unknown): ParrafoOracion[] | undefined {
  if (textos === undefined) return undefined
  if (!originales || !Array.isArray(textos) || textos.length !== originales.length) throw new Error('Vuelve a transcribir el audio antes de publicar el texto.')
  return originales.map((p, i) => {
    if (typeof textos[i] !== 'string' || !textos[i].trim() || textos[i].length > 4000) throw new Error('Cada párrafo debe tener texto, con un máximo de 4000 caracteres.')
    return { ...p, texto: textos[i].trim() }
  })
}
