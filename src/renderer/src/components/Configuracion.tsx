import { useEffect, useState } from 'react'
import { Alert, Button, Divider, Modal, Popconfirm, Progress, Space, Tag, Typography } from 'antd'
import { BarraActualizacion, type EstadoUpdate } from './BarraActualizacion'
import type { ConfigTranscripcion } from '../../../preload'

export function Configuracion({ abierto, cerrar, actualizacion }: { abierto: boolean; cerrar: () => void; actualizacion: EstadoUpdate }): JSX.Element {
  const [estado, setEstado] = useState<ConfigTranscripcion>()
  const [error, setError] = useState('')
  const [correoOcupado, setCorreoOcupado] = useState('')
  const [correoMensaje, setCorreoMensaje] = useState('')
  const [correoError, setCorreoError] = useState('')
  async function correo(action: 'sincronizar' | 'procesar-avisos'): Promise<void> {
    setCorreoOcupado(action); setCorreoMensaje(''); setCorreoError('')
    try { setCorreoMensaje(await window.api.gestionarCorreo(action)) }
    catch (e) { setCorreoError(e instanceof Error ? e.message : String(e)) }
    finally { setCorreoOcupado('') }
  }
  const [accion, setAccion] = useState(false)
  useEffect(() => {
    if (!abierto) return
    let vigente = true
    let consultando = false
    const refrescar = async (): Promise<void> => {
      if (consultando) return
      consultando = true
      try { const e = await window.api.estadoTranscriptor(); if (vigente) setEstado(e) }
      catch (e) { if (vigente) setError(String(e)) }
      finally { consultando = false }
    }
    void refrescar()
    const timer = setInterval(refrescar, 1000)
    return () => { vigente = false; clearInterval(timer) }
  }, [abierto])
  async function ejecutar(fn: () => Promise<void>): Promise<void> {
    setError(''); setAccion(true)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally {
      setAccion(false)
      window.api.estadoTranscriptor().then(setEstado).catch(e => setError(String(e)))
    }
  }
  const modelo = estado?.modelo
  const descargando = modelo?.fase === 'descargando' || modelo?.fase === 'verificando'
  return <Modal title="Configuración" open={abierto} onCancel={cerrar} footer={<Button onClick={cerrar}>Cerrar</Button>} width={620}>
    <Typography.Title level={4}>Transcripción</Typography.Title>
    <Typography.Paragraph>Convierte tus oraciones en texto en este Mac, sin enviar el audio a un servicio de inteligencia artificial. Después del primera descarga, puedes transcribir sin internet.</Typography.Paragraph>
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {error && <Alert type="error" message={error} showIcon />}
      {!estado && <Typography.Text role="status">Comprobando el transcriptor…</Typography.Text>}
      {estado && !estado.motorDisponible && <Alert type="warning" showIcon message="Falta instalar el motor de transcripción" description={<>Lucas debe ejecutar una vez en este Mac: <Typography.Text code>brew install whisper-cpp</Typography.Text>. Después vuelve a abrir esta configuración.</>} />}
      {modelo && <>
        <Space><Typography.Text strong>{modelo.nombre}</Typography.Text><Tag>Español</Tag></Space>
        <Typography.Text type="secondary">Descarga: {(modelo.bytes / 1000000).toFixed(0)} MB · Se guarda por separado y se conserva al actualizar el publicador.</Typography.Text>
        {descargando && <>
          <Typography.Text role="status">{modelo.fase === 'verificando' ? 'Verificando el modelo…' : 'Descargando el modelo…'}</Typography.Text>
          <Progress percent={modelo.porcentaje} status="active" />
          <Button onClick={() => window.api.cancelarDescargaTranscriptor().catch(e => setError(String(e)))}>Cancelar descarga</Button>
          <Typography.Text type="secondary">Puedes cerrar esta ventana. La descarga seguirá mientras el publicador esté abierto.</Typography.Text>
        </>}
        {modelo.fase === 'listo' ? <>
          <Tag color="success">{estado.motorDisponible ? 'Listo para transcribir' : 'Modelo descargado'}</Tag>
          <Typography.Text type="secondary">Espacio ocupado: {(modelo.bytes / 1000000).toFixed(0)} MB{modelo.enUso ? ' · Transcripción en curso' : ''}</Typography.Text>
          <Popconfirm title="¿Eliminar el modelo de este Mac?" description="Podrás descargarlo otra vez. Tus oraciones se conservarán." onConfirm={() => ejecutar(window.api.eliminarTranscriptor)} okText="Eliminar" cancelText="Conservar">
            <Button danger disabled={accion || modelo.enUso}>Eliminar modelo</Button>
          </Popconfirm>
        </> : !descargando && <>
          {modelo.mensaje && !error && <Alert type="info" message={modelo.mensaje} />}
          <Button type="primary" loading={accion} onClick={() => ejecutar(window.api.descargarTranscriptor)}>{modelo.fase === 'error' ? 'Reintentar descarga' : 'Descargar transcriptor'}</Button>
        </>}
      </>}
    </Space>
    <Divider />
    <Typography.Title level={4}>Suscriptores y avisos por correo</Typography.Title>
    <Typography.Paragraph>Los registros se guardan primero en la planilla. Cada 12 horas se sincronizan con Resend y se revisan las novedades. Aquí puedes adelantar esa revisión.</Typography.Paragraph>
    <Space direction="vertical" size="middle" style={{width: '100%'}}>
      <Button loading={correoOcupado === 'sincronizar'} disabled={!!correoOcupado} onClick={() => void correo('sincronizar')}>Sincronizar suscriptores ahora</Button>
      <Typography.Text type="secondary">Actualiza la lista en Resend. No envía correos.</Typography.Text>
      <Popconfirm title="¿Procesar y enviar los avisos pendientes?" description="Se puede enviar un correo real a todos los suscriptores activos, con las reflexiones seleccionadas que todavía no se anunciaron. Requiere que el envío esté activado." okText="Sí, procesar y enviar" cancelText="Cancelar" onConfirm={() => correo('procesar-avisos')}>
        <Button loading={correoOcupado === 'procesar-avisos'} disabled={!!correoOcupado}>Procesar avisos pendientes</Button>
      </Popconfirm>
      {correoMensaje && <Alert type="success" showIcon message={correoMensaje} />}
      {correoError && <Alert type="error" showIcon message={correoError} />}
    </Space>
    <Divider />
    <Typography.Title level={4}>Actualizaciones</Typography.Title>
    <BarraActualizacion estado={actualizacion} />
  </Modal>
}
