import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { EstadoModelo } from '../../../preload'

// Pinned upstream revision and LFS SHA-256, verified against upstream metadata.
export const MODELO = {
  nombre: 'Whisper Small', bytes: 487601967,
  sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small.bin'
}
export class GestorModelo {
  private estado: EstadoModelo = { fase: 'ausente', porcentaje: 0, bytes: MODELO.bytes, nombre: MODELO.nombre }
  private abort?: AbortController
  private comprobacion?: Promise<void>
  private verificado = false
  private usos = 0
  readonly archivo: string
  constructor(private carpeta: string, private manifest = MODELO, private descargar = fetch) {
    this.archivo = path.join(carpeta, 'ggml-small.bin')
    this.estado = { ...this.estado, nombre: manifest.nombre, bytes: manifest.bytes }
  }
  private cambiar(cambio: Partial<EstadoModelo>): void { this.estado = { ...this.estado, ...cambio } }
  private async verificar(archivo: string): Promise<void> {
    if ((await stat(archivo)).size !== this.manifest.bytes) throw new Error('El modelo está incompleto. Descárgalo otra vez.')
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(archivo)) hash.update(chunk)
    if (hash.digest('hex') !== this.manifest.sha256) throw new Error('La verificación del modelo falló. Descárgalo otra vez.')
  }
  async consultar(): Promise<EstadoModelo> {
    if (!this.verificado && !this.abort) {
      if (!this.comprobacion) this.comprobacion = (async () => {
        await rm(this.archivo + '.part', { force: true })
        this.cambiar({ fase: 'verificando', mensaje: undefined })
        try {
          await this.verificar(this.archivo)
          this.verificado = true
          this.cambiar({ fase: 'listo', porcentaje: 100 })
        } catch (e) {
          this.cambiar({ fase: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'ausente' : 'error', porcentaje: 0,
            mensaje: (e as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : String(e) })
        }
      })()
      await this.comprobacion
    }
    return { ...this.estado, enUso: this.usos > 0 }
  }
  async download(): Promise<void> {
    await this.consultar()
    if (this.abort || this.usos) throw new Error('El transcriptor está ocupado.')
    if (this.verificado) return
    const controller = new AbortController()
    this.abort = controller
    this.cambiar({ fase: 'descargando', porcentaje: 0, mensaje: undefined })
    const parcial = this.archivo + '.part'
    let timer: ReturnType<typeof setTimeout> | undefined
    const renovar = (): void => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), 60000) }
    try {
      await mkdir(this.carpeta, { recursive: true })
      renovar()
      const respuesta = await this.descargar(this.manifest.url, { signal: controller.signal })
      if (!respuesta.ok || !respuesta.body) throw new Error('No se pudo descargar el modelo. Revisa tu conexión e inténtalo otra vez.')
      const fichero = await open(parcial, 'w')
      let recibidos = 0
      try {
        for await (const chunk of respuesta.body as unknown as AsyncIterable<Uint8Array>) {
          renovar()
          recibidos += chunk.byteLength
          if (recibidos > this.manifest.bytes) throw new Error('El tamaño del modelo no es válido.')
          await fichero.writeFile(chunk)
          this.cambiar({ porcentaje: Math.min(99, Math.floor(recibidos / this.manifest.bytes * 100)) })
        }
        await fichero.sync()
      } finally { await fichero.close() }
      clearTimeout(timer)
      this.cambiar({ fase: 'verificando' })
      await this.verificar(parcial)
      controller.signal.throwIfAborted()
      await rename(parcial, this.archivo)
      this.verificado = true
      this.cambiar({ fase: 'listo', porcentaje: 100, mensaje: undefined })
    } catch (e) {
      await rm(parcial, { force: true })
      this.cambiar({ fase: 'error', porcentaje: 0, mensaje: controller.signal.aborted ? 'Descarga cancelada o conexión interrumpida. Puedes volver a intentarlo.' : (e instanceof Error ? e.message : String(e)) })
      throw new Error(this.estado.mensaje)
    } finally { clearTimeout(timer); this.abort = undefined }
  }
  cancelar(): void { this.abort?.abort() }
  async eliminar(): Promise<void> {
    await this.consultar()
    if (this.abort || this.usos) throw new Error('Espera a que termine la transcripción o la descarga.')
    await rm(this.archivo, { force: true })
    this.verificado = false
    this.comprobacion = Promise.resolve()
    this.cambiar({ fase: 'ausente', porcentaje: 0, mensaje: undefined })
  }
  async usar<T>(accion: (modelo: string) => Promise<T>): Promise<T> {
    await this.consultar()
    if (!this.verificado || this.abort) throw new Error('Descarga el transcriptor en Configuración antes de continuar.')
    this.usos++
    try { return await accion(this.archivo) } finally { this.usos-- }
  }
}
