import { useEffect, useState, useRef } from 'react'
import { Alert, Button, Card, Input, Space, Typography, Checkbox, Progress, Popconfirm, Upload, message, Tag, Collapse } from 'antd'
import type { RcFile } from 'antd/es/upload'
import { AudioOutlined, UploadOutlined, CloseOutlined } from '@ant-design/icons'
import { IconoIA } from '../components/IconoIA'
import type { AudioPreparado, ParrafoOracion, Tema } from '../../../preload'
import { Encabezado } from '../components/Encabezado'

const { Dragger } = Upload
const EXTENSIONES = ['m4a', 'mp3', 'wav', 'ogg', 'opus', 'aac', 'flac', 'amr', 'mp4', 'webm']
const ACEPTA = EXTENSIONES.map(e => `.${e}`).join(',')
const esAudio = (nombre: string): boolean => new RegExp(`\\.(${EXTENSIONES.join('|')})$`, 'i').test(nombre)
const mb = (n: number): string => `${(n / 1000000).toFixed(1)} MB`
const duracion = (n: number): string => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
// Electron antepone "Error invoking remote method '…': Error:" a los errores del proceso principal.
const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const TRANSCRIBIENDO = 'Transcribiendo la oración…'
const ENVIANDO = 'Enviando la oración…'
// Conserva la preparación al cambiar de pestaña, también durante una publicación.
let estado: {
  audio?: AudioPreparado; titulo: string; descripcion: string; ocupado: string; error: string; url: string
  parrafos: ParrafoOracion[]; incluirTexto: boolean; progreso: number; sinTranscriptor: boolean
  tema: string; temaNuevo: string
  /** El título que puso la app (nombre del archivo o sugerencia). Si el usuario lo cambió, no se pisa. */
  tituloAuto: string; sugiriendo: boolean; sugerenciaFallo: boolean
} = { titulo: '', descripcion: '', ocupado: '', error: '', url: '', parrafos: [], incluirTexto: true, progreso: 0, sinTranscriptor: false, tema: '', temaNuevo: '', tituloAuto: '', sugiriendo: false, sugerenciaFallo: false }
const observadores = new Set<() => void>()
function actualizar(cambio: Partial<typeof estado>): void {
  estado = { ...estado, ...cambio }
  observadores.forEach(fn => fn())
}

export default function Audios({ abrirConfiguracion }: { abrirConfiguracion: () => void }): JSX.Element {
  const player = useRef<HTMLAudioElement>(null)
  const [tiempo, setTiempo] = useState(0)
  const [, render] = useState(0)
  const [temas, setTemas] = useState<Tema[]>([])
  const cargarTemas = (): void => { window.api.listarTemas().then(setTemas).catch(() => undefined) }
  useEffect(() => {
    const refrescar = (): void => render(n => n + 1)
    observadores.add(refrescar)
    cargarTemas()
    const off = window.api.onProgresoTranscripcion(progreso => actualizar({ progreso }))
    return () => { observadores.delete(refrescar); off() }
  }, [])
  const { audio, titulo, descripcion, ocupado, error, url, parrafos, incluirTexto, progreso, sinTranscriptor, tema, temaNuevo, sugiriendo, sugerenciaFallo } = estado

  // Título y descripción propuestos por Codex a partir del texto. Si Codex no
  // responde (límite de uso, sin sesión), no pasa nada: se escriben a mano.
  async function sugerir(id: string, forzar = false): Promise<void> {
    if (!estado.parrafos.length) return
    actualizar({ sugiriendo: true, sugerenciaFallo: false })
    try {
      const s = await window.api.sugerirTituloAudio(id, estado.parrafos.map(p => p.texto))
      if (estado.audio?.id !== id) return
      const tituloIntacto = estado.titulo === estado.tituloAuto
      actualizar({
        ...(forzar || tituloIntacto ? { titulo: s.titulo, tituloAuto: s.titulo } : {}),
        ...(forzar || !estado.descripcion.trim() ? { descripcion: s.descripcion } : {})
      })
    } catch {
      if (estado.audio?.id === id) actualizar({ sugerenciaFallo: true })
    } finally { if (estado.audio?.id === id) actualizar({ sugiriendo: false }) }
  }
  // La transcripción arranca sola tras preparar el audio. Si el transcriptor no está
  // listo no bloquea nada: se publica sin texto y se ofrece configurarlo.
  async function transcribir(id: string): Promise<void> {
    actualizar({ ocupado: TRANSCRIBIENDO, progreso: 0, error: '', sinTranscriptor: false })
    try {
      const config = await window.api.estadoTranscriptor()
      if (config.modelo.fase !== 'listo' || !config.motorDisponible) { actualizar({ sinTranscriptor: true }); return }
      const nuevos = await window.api.transcribirAudio(id)
      if (estado.audio?.id !== id) return
      actualizar({ parrafos: nuevos, incluirTexto: true, ocupado: '' })
      await sugerir(id)
    } catch (e) {
      // Cancelar no es un error para quien lo pidió.
      if (estado.audio?.id === id) actualizar({ error: mensaje(e) })
    } finally { if (estado.ocupado === TRANSCRIBIENDO) actualizar({ ocupado: '' }) }
  }
  async function preparar(archivo: string): Promise<void> {
    actualizar({ ocupado: 'Preparando tu nota de voz…', error: '', url: '', sinTranscriptor: false, sugerenciaFallo: false })
    try {
      const preparado = await window.api.prepararAudio(archivo)
      const tituloInicial = preparado.nombre.replace(/\.[^.]+$/, '')
      actualizar({ audio: preparado, titulo: tituloInicial, tituloAuto: tituloInicial, descripcion: '', parrafos: [], incluirTexto: true, ocupado: '' })
      await transcribir(preparado.id)
    } catch (e) { actualizar({ error: mensaje(e), ocupado: '' }) }
  }
  async function seleccionar(): Promise<void> {
    actualizar({ ocupado: 'Seleccionando audio…', error: '', url: '' })
    try {
      const archivo = await window.api.elegirAudio()
      if (archivo) await preparar(archivo)
    } catch (e) { actualizar({ error: mensaje(e) }) }
    finally { if (estado.ocupado === 'Seleccionando audio…') actualizar({ ocupado: '' }) }
  }
  // Soltar en el recuadro: sólo se toma la primera nota de voz; el resto se avisa.
  function soltar(file: RcFile, lista: RcFile[]): false {
    if (file.uid !== lista[0]?.uid) return false
    if (estado.ocupado) { void message.warning('Espera a que termine el audio en proceso.'); return false }
    const validos = lista.filter(f => esAudio(f.name))
    if (!validos.length) { actualizar({ error: 'Ese archivo no es una nota de voz. Usa M4A, MP3, WAV, OGG, OPUS, AAC, FLAC, AMR, MP4 o WebM.' }); return false }
    if (lista.length > 1) void message.info('Se publica una oración por vez. Se tomó la primera nota de voz.')
    let ruta = ''
    try { ruta = window.api.getPathForFile(validos[0]) } catch { /* sin ruta no se puede preparar */ }
    if (!ruta) { actualizar({ error: 'No se pudo leer el archivo arrastrado. Prueba con el botón "Buscar en el equipo".' }); return false }
    void preparar(ruta)
    return false
  }
  // Cancelar vuelve al recuadro vacío. Si está transcribiendo, se corta la transcripción.
  function cancelar(): void {
    if (estado.ocupado === TRANSCRIBIENDO) window.api.cancelarTranscripcion().catch(() => undefined)
    player.current?.pause()
    actualizar({ audio: undefined, titulo: '', tituloAuto: '', descripcion: '', parrafos: [], incluirTexto: true, error: '', url: '', ocupado: '', progreso: 0, sinTranscriptor: false, tema: '', temaNuevo: '', sugiriendo: false, sugerenciaFallo: false })
  }
  async function publicar(): Promise<void> {
    if (!audio) return
    actualizar({ ocupado: ENVIANDO, error: '', url: '' })
    try {
      const resultado = await window.api.publicarAudio(audio.id, titulo, descripcion, temaNuevo.trim() || tema, incluirTexto && parrafos.length ? parrafos.map(p => p.texto) : undefined)
      actualizar({ audio: undefined, titulo: '', tituloAuto: '', descripcion: '', url: resultado.url, parrafos: [], sinTranscriptor: false, tema: '', temaNuevo: '', sugerenciaFallo: false })
      cargarTemas()
    } catch (e) { actualizar({ error: mensaje(e) }) }
    finally { actualizar({ ocupado: '' }) }
  }
  function escuchar(inicio: number): void {
    if (!player.current) return
    player.current.currentTime = inicio
    void player.current.play().catch(() => actualizar({ error: 'Pulsa el botón de reproducción para escuchar el audio.' }))
  }
  const preparando = !audio && !!ocupado
  const enviando = ocupado === ENVIANDO
  const textoIncompleto = incluirTexto && parrafos.length > 0 && parrafos.some(p => !p.texto.trim())
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Encabezado titulo="Publicar audio" descripcion="Comparte una oración con tu propia voz. Arrastra la grabación, escúchala y publícala." />
        {error && <Alert type="error" showIcon message="No se pudo completar" description={error} />}
        {url && <Alert type="success" showIcon message="Oración enviada" description={<>El sitio puede tardar unos minutos en actualizarse. <Button type="link" onClick={() => window.api.abrirEnlace(url)}>Abrir oración</Button></>} />}
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {!audio && !preparando && <Dragger accept={ACEPTA} multiple={false} showUploadList={false} beforeUpload={soltar} style={{ padding: '12px 0' }}>
              <p className="ant-upload-drag-icon"><AudioOutlined /></p>
              <p className="ant-upload-text">Arrastra aquí tu nota de voz</p>
              <p className="ant-upload-hint">O haz clic aquí para buscarla. Notas de WhatsApp, grabaciones del teléfono y otros audios. Hasta 60 minutos y 250 MB por archivo.</p>
              <Button size="large" icon={<UploadOutlined />} onClick={e => { e.stopPropagation(); void seleccionar() }} style={{ marginTop: 8 }}>Buscar en el equipo</Button>
            </Dragger>}
            {preparando && <Typography.Text role="status">{ocupado}</Typography.Text>}
            {audio && <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <Typography.Text strong style={{ display: 'block' }}>{audio.nombre}</Typography.Text>
                  <Typography.Text type="secondary">{duracion(audio.duracion)} · Archivo original: {mb(audio.bytesOriginal)} · Listo para publicar: {mb(audio.bytes)}</Typography.Text>
                </div>
                <Space>
                  <Button danger icon={<CloseOutlined />} disabled={enviando} onClick={cancelar}>Cancelar</Button>
                  <Button type="primary" size="large" icon={<UploadOutlined />} loading={enviando} disabled={!titulo.trim() || !!ocupado || textoIncompleto} onClick={publicar}>Publicar oración</Button>
                </Space>
              </div>
              <audio ref={player} onTimeUpdate={e => setTiempo(e.currentTarget.currentTime)} onSeeked={e => setTiempo(e.currentTarget.currentTime)} controls preload="metadata" src={audio.preview} style={{ width: '100%' }} aria-label="Escuchar la oración antes de publicar" />
              {ocupado === TRANSCRIBIENDO && <>
                <Typography.Text role="status">Escribiendo el texto de la oración… en un momento podrás completar los datos.</Typography.Text>
                <Progress percent={progreso} status="active" />
              </>}
              {sinTranscriptor && <Alert type="info" showIcon message="Se publicará sólo el audio" description={<>Para publicar también el texto, hace falta el transcriptor. <Button type="link" onClick={abrirConfiguracion}>Configurar transcriptor</Button></>} />}
              {ocupado !== TRANSCRIBIENDO && <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <label htmlFor="audio-titulo">Título de la oración</label>
                {!sugiriendo && sugerenciaFallo && <Typography.Text type="secondary">No hubo sugerencia esta vez; escríbelos tú.</Typography.Text>}
                {!!parrafos.length && <Button type="link" icon={<IconoIA style={{ fontSize: 22 }} />} loading={sugiriendo} disabled={enviando} role={sugiriendo ? 'status' : undefined} onClick={() => void sugerir(audio.id, true)} style={{ paddingInline: 4 }}>
                  {sugiriendo ? 'Proponiendo título y descripción…' : sugerenciaFallo ? 'Intentar de nuevo' : 'Proponer otro título'}
                </Button>}
              </div>
              <Input id="audio-titulo" size="large" value={titulo} maxLength={120} disabled={enviando || sugiriendo} placeholder="Una oración por nuestra familia" onChange={e => actualizar({ titulo: e.target.value })} />
              <label htmlFor="audio-descripcion">Descripción (opcional)</label>
              <Input.TextArea id="audio-descripcion" value={descripcion} maxLength={2000} autoSize={{ minRows: 2, maxRows: 6 }} disabled={enviando || sugiriendo} onChange={e => actualizar({ descripcion: e.target.value })} />
              <label htmlFor="audio-tema">Tema (opcional)</label>
              {temas.length > 0 && <Space size={[4, 8]} wrap>
                {temas.map(t => <Tag.CheckableTag key={t.id} checked={!temaNuevo.trim() && tema === t.nombre} onChange={() => actualizar({ tema: tema === t.nombre ? '' : t.nombre, temaNuevo: '' })} style={{ fontSize: 14, padding: '4px 12px', border: '1px solid #d9d9d9' }}>{t.nombre}</Tag.CheckableTag>)}
              </Space>}
              <Input id="audio-tema" placeholder={temas.length ? 'O escribe un tema nuevo…' : 'Ej.: Familia, Oración, Sanidad…'} value={temaNuevo} maxLength={120} allowClear disabled={enviando} onChange={e => actualizar({ temaNuevo: e.target.value })} />
              {!!parrafos.length && <Collapse ghost items={[{
                key: 'texto',
                label: <Space><Typography.Text strong>Texto de la oración</Typography.Text><Typography.Text type="secondary">{incluirTexto ? `${parrafos.length} párrafo${parrafos.length === 1 ? '' : 's'} · se publica con el audio` : 'no se publica'}</Typography.Text></Space>,
                children: <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Checkbox checked={incluirTexto} disabled={!!ocupado} onChange={e => actualizar({ incluirTexto: e.target.checked })}>Publicar también el texto</Checkbox>
                  {incluirTexto && <>
                    <Typography.Text type="secondary">Ya está listo. Si ves algún error, corrígelo aquí mismo; el resto no hace falta tocarlo.</Typography.Text>
                    {parrafos.map((p, i) => <div key={i} style={{ padding: 12, borderRadius: 8, background: tiempo >= p.inicio && tiempo < p.fin ? '#e6f4ff' : '#fafafa' }}>
                      <Button size="small" type="link" onClick={() => escuchar(p.inicio)}>Escuchar desde {duracion(p.inicio)}</Button>
                      <Input.TextArea aria-label={`Párrafo ${i + 1}`} autoSize={{ minRows: 1, maxRows: 8 }} value={p.texto} maxLength={4000} disabled={!!ocupado} onChange={e => actualizar({ parrafos: parrafos.map((item, n) => n === i ? { ...item, texto: e.target.value } : item) })} />
                    </div>)}
                    {textoIncompleto && <Typography.Text type="warning">Hay un párrafo vacío: escribe algo o quita la marca de "Publicar también el texto".</Typography.Text>}
                    <Popconfirm title="¿Volver a transcribir?" description="Se reemplazará el texto y tus correcciones." onConfirm={() => void transcribir(audio.id)} okText="Transcribir" cancelText="Conservar">
                      <Button type="link" size="small" disabled={!!ocupado} style={{ paddingLeft: 0 }}>Volver a transcribir</Button>
                    </Popconfirm>
                  </>}
                </Space>
              }]} />}
              </>}
              <Typography.Text type="secondary">Al publicar, cualquier persona podrá escuchar y descargar esta oración.</Typography.Text>
            </>}
          </Space>
        </Card>
      </Space>
    </div>
  )
}
