import { useEffect, useState } from 'react'
import { Alert, App, Input, Modal, Space, Tag, Typography } from 'antd'
import type { Oracion, Tema } from '../../../preload'

const { Paragraph, Text } = Typography
const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * Editar una oración publicada: título, descripción y tema. Sólo cambia el
 * catálogo; la dirección /oraciones/<slug>, el audio y el texto se quedan
 * donde están — la misma decisión que con el título de una reflexión.
 */
export function DialogoAudio({ oracion, temas, onCerrar, onListo }: {
  oracion: Oracion | null
  temas: Tema[]
  onCerrar: () => void
  onListo: () => Promise<void>
}): JSX.Element {
  const { notification } = App.useApp()
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tema, setTema] = useState('')
  const [temaNuevo, setTemaNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const nombreDe = (id?: string): string => (id && temas.find(t => t.id === id)?.nombre) || ''
  useEffect(() => {
    setTitulo(oracion?.titulo ?? ''); setDescripcion(oracion?.descripcion ?? '')
    setTema(nombreDe(oracion?.temaId)); setTemaNuevo(''); setError('')
  }, [oracion]) // eslint-disable-line react-hooks/exhaustive-deps

  const temaFinal = temaNuevo.trim() || tema
  const cambió = oracion !== null && titulo.trim() !== '' && (
    titulo.trim() !== oracion.titulo || descripcion.trim() !== oracion.descripcion || temaFinal !== nombreDe(oracion.temaId))

  async function guardar(): Promise<void> {
    if (!oracion || !cambió) return
    setGuardando(true); setError('')
    try {
      await window.api.editarAudio(oracion.id, { titulo: titulo.trim(), descripcion: descripcion.trim(), tema: temaFinal })
      await onListo()
      notification.success({
        message: 'Oración actualizada y publicada',
        description: <>El sitio tarda <b>1–2 minutos</b> en reconstruirse. La dirección no cambia: <Text code style={{ fontSize: 12 }}>/oraciones/{oracion.slug}</Text></>,
        duration: 12, placement: 'bottomRight'
      })
      onCerrar()
    } catch (e) { setError(mensaje(e)) } finally { setGuardando(false) }
  }

  return (
    <Modal open={oracion !== null} title="Editar la oración" okText="Guardar y publicar" cancelText="Cancelar" onCancel={onCerrar} onOk={guardar}
      okButtonProps={{ disabled: !cambió, loading: guardando }} cancelButtonProps={{ disabled: guardando }} destroyOnClose width={640}>
      {oracion && <Space direction="vertical" size="middle" style={{ width: '100%', paddingTop: 8 }}>
        <div>
          <label htmlFor="editar-titulo">Título</label>
          <Input id="editar-titulo" value={titulo} maxLength={120} autoFocus disabled={guardando} onChange={e => setTitulo(e.target.value)} onPressEnter={e => { e.preventDefault(); void guardar() }} />
        </div>
        <div>
          <label htmlFor="editar-descripcion">Descripción (opcional)</label>
          <Input.TextArea id="editar-descripcion" value={descripcion} maxLength={2000} autoSize={{ minRows: 2, maxRows: 6 }} disabled={guardando} onChange={e => setDescripcion(e.target.value)} />
        </div>
        <div>
          <label htmlFor="editar-tema">Tema (opcional)</label>
          {temas.length > 0 && <Space size={[4, 8]} wrap style={{ marginBlock: 8 }}>
            {temas.map(t => <Tag.CheckableTag key={t.id} checked={!temaNuevo.trim() && tema === t.nombre} onChange={() => { setTema(tema === t.nombre ? '' : t.nombre); setTemaNuevo('') }} style={{ fontSize: 14, padding: '4px 12px', border: '1px solid #d9d9d9' }}>{t.nombre}</Tag.CheckableTag>)}
          </Space>}
          <Input id="editar-tema" placeholder="O escribe un tema nuevo…" value={temaNuevo} maxLength={120} allowClear disabled={guardando} onChange={e => setTemaNuevo(e.target.value)} />
        </div>
        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
          La dirección <b>no</b> se mueve — sigue siendo <Text code style={{ fontSize: 12 }}>/oraciones/{oracion.slug}</Text>. El audio y el texto tampoco cambian. Se publica solo y tarda 1–2 minutos en verse.
        </Paragraph>
        {error && <Alert type="error" showIcon message={error} />}
      </Space>}
    </Modal>
  )
}
