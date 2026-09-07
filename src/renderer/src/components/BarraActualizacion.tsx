import { Button, Space, Typography, App } from 'antd'
import { useEffect, useState } from 'react'
import type { EstadoActualizacion } from '../../../preload'
export type EstadoUpdate = EstadoActualizacion | { fase: 'inactivo' }

export function BarraActualizacion({ estado }: { estado: EstadoUpdate }): JSX.Element {
  const [version, setVersion] = useState('—')
  const { message } = App.useApp()
  useEffect(() => { window.api.obtenerVersionApp().then(setVersion).catch(() => {}) }, [])
  const ejecutar = (fn: () => Promise<void>): void => { fn().catch(e => message.error(String(e))) }
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Typography.Text>Versión instalada: {version}</Typography.Text>
    {estado.fase === 'no-disponible' && <Typography.Text type="success">Ya tienes la última versión.</Typography.Text>}
    {estado.fase === 'error' && <Typography.Text type="danger">{estado.mensaje}</Typography.Text>}
    {(estado.fase === 'disponible' || estado.fase === 'descargando') && <Typography.Text>Descargando actualización… {estado.fase === 'descargando' ? `${estado.porcentaje}%` : ''}</Typography.Text>}
    {estado.fase === 'descargada' ? <>
      <Typography.Text strong>Versión {estado.version} lista para instalar.</Typography.Text>
      {estado.notas && <Typography.Paragraph style={{ whiteSpace: 'pre-line' }}>{estado.notas}</Typography.Paragraph>}
      <Typography.Text type="secondary">La aplicación se cerrará y volverá a abrirse.</Typography.Text>
      <Button type="primary" onClick={() => ejecutar(window.api.instalarActualizacion)}>Instalar y reiniciar</Button>
    </> : <Button loading={estado.fase === 'buscando'} disabled={estado.fase === 'descargando' || estado.fase === 'disponible'} onClick={() => ejecutar(window.api.buscarActualizaciones)}>Buscar actualizaciones</Button>}
  </Space>
}
