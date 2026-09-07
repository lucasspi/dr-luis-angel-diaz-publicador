import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { spawn } from 'node:child_process'

export async function encontrarWhisper(): Promise<string | null> {
  for (const carpeta of ['/opt/homebrew/bin', '/usr/local/bin', ...(process.env.PATH || '').split(delimiter)]) {
    if (!carpeta) continue
    const archivo = join(carpeta, 'whisper-cli')
    try { await access(archivo, constants.X_OK); return archivo } catch { /* next */ }
  }
  return null
}
export async function ejecutarWhisper(modelo: string, wav: string, salida: string, signal: AbortSignal, progreso: (n: number) => void): Promise<void> {
  const binario = await encontrarWhisper()
  if (!binario) throw new Error('Falta el motor de transcripción. En Configuración encontrarás cómo instalarlo.')
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const proceso = spawn(binario, ['-m', modelo, '-f', wav, '-l', 'es', '-oj', '-of', salida, '-pp', '-t', '4'], { signal })
    const timeout = setTimeout(() => proceso.kill('SIGTERM'), 60 * 60 * 1000)
    let pendiente = ''
    proceso.stdout.resume()
    proceso.stderr.on('data', (chunk: Buffer) => {
      pendiente = (pendiente + chunk.toString()).slice(-4000)
      for (const match of pendiente.matchAll(/progress\s*=\s*(\d+)%/g)) progreso(Math.min(99, Number(match[1])))
      pendiente = pendiente.slice(pendiente.lastIndexOf('\n') + 1)
    })
    proceso.on('error', (e) => { if (!signal.aborted) { clearTimeout(timeout); reject(e) } })
    proceso.on('close', (code) => {
      clearTimeout(timeout)
      if (signal.aborted) reject(new Error('Transcripción cancelada. El audio sigue disponible.'))
      else if (code === 0) resolve()
      else reject(new Error('No se pudo transcribir. Puedes reintentar o publicar sólo el audio.'))
    })
  })
}
