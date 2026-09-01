import { Button, Space, Spin, Typography } from 'antd'

const { Text } = Typography

export type EstadoUpdate =
  | { fase: 'inactivo' }
  | { fase: 'buscando' }
  | { fase: 'no-disponible' }
  | { fase: 'disponible'; version: string }
  | { fase: 'descargando'; porcentaje: number }
  | { fase: 'descargada'; version: string }
  | { fase: 'error'; mensaje: string }

export function BarraActualizacion({ estado }: { estado: EstadoUpdate }): JSX.Element {
  if (estado.fase === 'descargada') {
    return (
      <Button type="primary" size="small" onClick={() => window.api.instalarActualizacion()}>
        Actualizar ahora (v{estado.version})
      </Button>
    )
  }
  if (estado.fase === 'buscando') {
    return (
      <Text type="secondary">
        <Spin size="small" /> Buscando actualizaciones…
      </Text>
    )
  }
  if (estado.fase === 'disponible' || estado.fase === 'descargando') {
    const porcentaje = estado.fase === 'descargando' ? estado.porcentaje : 0
    return <Text type="secondary">Descargando actualización… {porcentaje}%</Text>
  }
  if (estado.fase === 'error') {
    return (
      <Space size={4}>
        <Text type="danger">No se pudo buscar actualizaciones.</Text>
        <Button size="small" type="text" onClick={() => window.api.buscarActualizaciones()}>
          Reintentar
        </Button>
      </Space>
    )
  }
  return (
    <Space size={4}>
      {estado.fase === 'no-disponible' && <Text type="secondary">Ya tienes la última versión.</Text>}
      <Button size="small" type="text" onClick={() => window.api.buscarActualizaciones()}>
        Buscar actualizaciones
      </Button>
    </Space>
  )
}
