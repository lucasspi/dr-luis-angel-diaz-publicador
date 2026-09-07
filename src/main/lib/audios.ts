import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import type { GestorModelo } from './transcripcion/modelo'
import { ejecutarWhisper } from './transcripcion/motor'
import { parrafosWhisper, revisarParrafos } from './transcripcion/segmentos'
import { git, sincronizar } from './git'
import { asegurarTema, RUTA_TEMAS } from './temas'
import { slugificarCategoria } from './slug'

const ejecutar = promisify(execFile)
const MAX_ENTRADA = 250 * 1024 * 1024
const MAX_SALIDA = 20 * 1024 * 1024
import type { AudioPreparado, Oracion, ParrafoOracion } from '../../preload'
interface Borrador { info: AudioPreparado; carpeta: string; archivo: string; original: string; parrafos?: ParrafoOracion[]; publicacion?: Oracion }
let borrador: Borrador | undefined
let ocupado = false
let transcripcion: AbortController | undefined
export function audioOcupado(): boolean { return ocupado }
export function cancelarTranscripcion(): void { transcripcion?.abort() }

async function exclusivo<T>(operacion: () => Promise<T>): Promise<T> {
  if (ocupado) throw new Error('Ya hay un audio en proceso. Espera a que termine.')
  ocupado = true
  try { return await operacion() } finally { ocupado = false }
}

async function binario(nombre: string): Promise<string> {
  for (const carpeta of ['/opt/homebrew/bin', '/usr/local/bin']) {
    const candidato = path.join(carpeta, nombre)
    try { await access(candidato, constants.X_OK); return candidato } catch { /* probar PATH */ }
  }
  try { await ejecutar(nombre, ['-version']); return nombre } catch {
    throw new Error('Falta FFmpeg para preparar el audio. Lucas puede instalarlo con: brew install ffmpeg')
  }
}

export async function prepararAudio(archivo: string): Promise<AudioPreparado> {
  return exclusivo(async () => {
    if (typeof archivo !== 'string' || !path.isAbsolute(archivo) || !/\.(m4a|mp3|wav|ogg|opus|aac|flac|amr|mp4|webm)$/i.test(archivo)) {
      throw new Error('Selecciona una nota de voz M4A, MP3, WAV, OGG, OPUS, AAC, FLAC, AMR, MP4 o WebM.')
    }
    const entrada = await stat(archivo)
    if (!entrada.isFile() || entrada.size === 0 || entrada.size > MAX_ENTRADA) throw new Error('El archivo debe contener audio y pesar como máximo 250 MB.')
    const ffmpeg = await binario('ffmpeg')
    const ffprobe = await binario('ffprobe')
    const carpeta = await mkdtemp(path.join(os.tmpdir(), 'oracion-'))
    const salida = path.join(carpeta, 'audio.mp3')
    try {
      // Un segundo extra permite detectar exceso sin truncar una oración silenciosamente.
      await ejecutar(ffmpeg, ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', archivo,
        '-map', '0:a:0', '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '24000',
        '-codec:a', 'libmp3lame', '-b:a', '48k', '-t', '3601', '-y', salida], { timeout: 600000, maxBuffer: 1024 * 1024 })
      const { stdout } = await ejecutar(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', salida])
      const duracion = Number(JSON.parse(stdout).format?.duration)
      if (!Number.isFinite(duracion) || duracion <= 0 || duracion > 3600) throw new Error('La oración debe durar entre un segundo y 60 minutos.')
      const bytes = (await stat(salida)).size
      if (bytes > MAX_SALIDA) throw new Error('El audio comprimido supera el límite de 20 MB.')
      const info: AudioPreparado = { id: randomUUID(), nombre: path.basename(archivo), bytesOriginal: entrada.size,
        bytes, duracion, preview: `data:audio/mpeg;base64,${(await readFile(salida)).toString('base64')}` }
      const original = path.join(carpeta, 'original.wav')
      await ejecutar(ffmpeg, ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', archivo, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-t', '3600', '-y', original], { timeout: 600000 })
      if (borrador) await rm(borrador.carpeta, { recursive: true, force: true })
      borrador = { info, carpeta, archivo: salida, original }
      return info
    } catch (error) {
      await rm(carpeta, { recursive: true, force: true })
      if (error instanceof Error && /Command failed|timed out/.test(error.message)) throw new Error('No se pudo leer o comprimir la nota de voz. Prueba con otro archivo de audio.')
      throw error
    }
  })
}

export async function transcribirAudio(id: string, modelos: GestorModelo, progreso: (n: number) => void): Promise<ParrafoOracion[]> {
  return exclusivo(async () => {
    if (!borrador || borrador.info.id !== id) throw new Error('Selecciona de nuevo el audio.')
    if (borrador.publicacion) throw new Error('Resuelve el envío pendiente antes de cambiar el texto.')
    const actual = borrador
    const control = new AbortController()
    transcripcion = control
    const salida = path.join(actual.carpeta, 'transcripcion')
    try {
      await modelos.usar(async modelo => {
        progreso(0)
        await ejecutarWhisper(modelo, actual.original, salida, control.signal, progreso)
      })
      control.signal.throwIfAborted()
      const parrafos = parrafosWhisper(JSON.parse(await readFile(salida + '.json', 'utf8')), actual.info.duracion)
      actual.parrafos = parrafos
      progreso(100)
      return parrafos
    } catch (e) {
      if (control.signal.aborted) throw new Error('Transcripción cancelada. El audio sigue disponible.')
      throw e
    } finally {
      transcripcion = undefined
      await rm(salida + '.json', { force: true })
    }
  })
}

const RUTA_CATALOGO = path.join('content', 'oraciones.json')

// El catálogo es la tabla de oraciones (identidad, tema, datos del audio). La
// transcripción va aparte en content/oraciones/<id>.json. Ver content/README.md del sitio.
async function leerCatalogo(repo: string): Promise<Oracion[]> {
  try {
    const { oraciones } = JSON.parse(await readFile(path.join(repo, RUTA_CATALOGO), 'utf8'))
    return Array.isArray(oraciones) ? oraciones : []
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

export async function listarAudios(repo: string): Promise<Oracion[]> {
  return (await leerCatalogo(repo)).sort((a, b) => b.fecha.localeCompare(a.fecha))
}

function slugUnico(titulo: string, ocupados: Set<string>): string {
  const base = slugificarCategoria(titulo) || 'oracion'
  let slug = base
  for (let n = 2; ocupados.has(slug); n++) slug = `${base}-${n}`
  return slug
}

export function textoTranscrito(id: string): string {
  if (!borrador || borrador.info.id !== id) throw new Error('Vuelve a seleccionar y preparar el audio.')
  return (borrador.parrafos ?? []).map(p => p.texto).join('\n\n')
}

export async function publicarAudio(repo: string, id: string, titulo: string, descripcion: string, tema: string, textos?: string[]): Promise<{ url: string }> {
  return exclusivo(async () => {
    if (!borrador || borrador.info.id !== id) throw new Error('Vuelve a seleccionar y preparar el audio.')
    if (typeof titulo !== 'string' || !titulo.trim() || titulo.trim().length > 120) throw new Error('Escribe un título de hasta 120 caracteres.')
    if (typeof descripcion !== 'string' || descripcion.length > 2000) throw new Error('La descripción admite hasta 2000 caracteres.')
    if (typeof tema !== 'string' || tema.length > 120) throw new Error('El tema admite hasta 120 caracteres.')
    if ((await git(['branch', '--show-current'], repo)).trim() !== 'master') throw new Error('El sitio debe estar en la rama master antes de publicar. Contacta a Lucas.')
    const audio = `public/audio/${id}.mp3`
    const ficha = `content/oraciones/${id}.json`
    // Un push fallido se puede reintentar sin crear otra oración ni otro commit.
    if (!borrador.publicacion) {
      const parrafos = revisarParrafos(borrador.parrafos, textos)
      if ((await git(['status', '--porcelain'], repo)).trim()) throw new Error('Hay cambios pendientes en el sitio. Contacta a Lucas antes de publicar el audio.')
      await sincronizar(repo)
      const catalogoPrevio = await leerCatalogo(repo)
      if (catalogoPrevio.some(o => o.id === id)) throw new Error('Esta oración ya está publicada.')
      // El tema se da de alta aquí, después de comprobar que el sitio está limpio,
      // para que temas.json entre en el mismo commit que la oración.
      await mkdir(path.join(repo, 'public/audio'), { recursive: true })
      await mkdir(path.join(repo, 'content/oraciones'), { recursive: true })
      const teniaTemas = await stat(path.join(repo, RUTA_TEMAS)).then(() => true, () => false)
      const { id: temaId, creado } = await asegurarTema(repo, tema)
      if (tema.trim() && !temaId) throw new Error('El tema no es válido.')
      const item: Oracion = { id, slug: slugUnico(titulo, new Set(catalogoPrevio.map(o => o.slug))), titulo: titulo.trim(), descripcion: descripcion.trim(),
        fecha: new Date().toISOString(), ...(temaId ? { temaId } : {}), audio: `/audio/${id}.mp3`,
        duracion: borrador.info.duracion, bytes: borrador.info.bytes, ...(parrafos ? { transcripcion: `${id}.json` } : {}) }
      const archivos = [audio, RUTA_CATALOGO, ...(parrafos ? [ficha] : []), ...(creado ? [RUTA_TEMAS] : [])]
      try {
        await copyFile(borrador.archivo, path.join(repo, audio), constants.COPYFILE_EXCL)
        if (parrafos) await writeFile(path.join(repo, ficha), JSON.stringify({ id, parrafos }, null, 2) + '\n', { flag: 'wx' })
        await writeFile(path.join(repo, RUTA_CATALOGO), JSON.stringify({ oraciones: [...catalogoPrevio, item] }, null, 2) + '\n')
        await git(['add', '--', ...archivos], repo)
        await git(['commit', '--only', '-m', `oración: ${item.titulo}`, '--', ...archivos], repo)
        borrador.publicacion = { ...item, ...(parrafos ? { parrafos } : {}) }
      } catch (error) {
        // Sólo lo que tocó esta operación: los archivos nuevos se borran, los
        // que ya existían (catálogo, temas) vuelven a como estaban en HEAD.
        await git(['reset', '--', ...archivos], repo)
        await rm(path.join(repo, audio), { force: true })
        await rm(path.join(repo, ficha), { force: true })
        if (catalogoPrevio.length) await git(['checkout', '--', RUTA_CATALOGO], repo).catch(() => undefined)
        else await rm(path.join(repo, RUTA_CATALOGO), { force: true })
        if (creado && teniaTemas) await git(['checkout', '--', RUTA_TEMAS], repo).catch(() => undefined)
        else if (creado) await rm(path.join(repo, RUTA_TEMAS), { force: true })
        throw error
      }
    }
    try {
      await git(['push', 'origin', 'master'], repo)
    } catch {
      try { await sincronizar(repo); await git(['push', 'origin', 'master'], repo) } catch {
        throw new Error('La oración está guardada localmente, pero no se pudo enviar. Revisa la conexión y pulsa Publicar otra vez. Si sigue fallando, contacta a Lucas.')
      }
    }
    await rm(borrador.carpeta, { recursive: true, force: true })
    borrador = undefined
    return { url: `https://drluisangeldiaz.com/oraciones#${id}` }
  })
}
