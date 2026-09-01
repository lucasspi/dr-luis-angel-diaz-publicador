import { CheckCircleFilled, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { Button, Divider, Modal, Space, Spin, Typography } from 'antd'
import { useEffect, useState } from 'react'

const { Paragraph, Text, Title } = Typography

export type EstadoUpdate =
  | { fase: 'inactivo' }
  | { fase: 'buscando' }
  | { fase: 'no-disponible' }
  | { fase: 'disponible'; version: string }
  | { fase: 'descargando'; porcentaje: number }
  | { fase: 'descargada'; version: string; fecha?: string; notas?: string }
  | { fase: 'error'; mensaje: string }

export function BarraActualizacion({ estado }: { estado: EstadoUpdate }): JSX.Element {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [versionActual, setVersionActual] = useState('—')

  useEffect(() => {
    window.api.obtenerVersionApp().then(setVersionActual)
  }, [])

  useEffect(() => {
    if (estado.fase === 'descargada') setModalAbierto(true)
  }, [estado])

  if (estado.fase === 'descargada') {
    return (
      <>
        <Button type="primary" size="small" onClick={() => setModalAbierto(true)}>
          Actualización lista · v{estado.version}
        </Button>
        <Modal
          open={modalAbierto}
          onCancel={() => setModalAbierto(false)}
          width={680}
          centered
          title={null}
          footer={null}
          destroyOnClose={false}
        >
          <div style={{ display: 'flex', gap: 18, padding: '10px 4px 2px' }}>
            <div
              style={{
                width: 52,
                height: 52,
                flex: '0 0 52px',
                borderRadius: 14,
                display: 'grid',
                placeItems: 'center',
                color: '#1677ff',
                background: '#e6f4ff',
                fontSize: 24
              }}
            >
              <DownloadOutlined />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.6 }}>
                ACTUALIZACIÓN DEL PUBLICADOR
              </Text>
              <Title level={3} style={{ margin: '5px 0 4px' }}>
                La versión {estado.version} está lista para instalarse
              </Title>
              <Paragraph type="secondary" style={{ margin: 0, fontSize: 15 }}>
                La actualización ya se descargó. Para completar la instalación, el Publicador
                deberá cerrarse y volver a abrirse.
              </Paragraph>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              gap: 18,
              margin: '24px 0 18px',
              padding: '16px 20px',
              background: '#fafafa',
              border: '1px solid #f0f0f0',
              borderRadius: 12
            }}
          >
            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                VERSIÓN INSTALADA
              </Text>
              <Text strong style={{ fontSize: 18 }}>v{versionActual}</Text>
            </div>
            <Text type="secondary">→</Text>
            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                NUEVA VERSIÓN
              </Text>
              <Space size={7}>
                <Text strong style={{ fontSize: 18 }}>v{estado.version}</Text>
                <CheckCircleFilled style={{ color: '#52c41a' }} />
              </Space>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <InfoCircleOutlined style={{ color: '#8c8c8c', marginTop: 4 }} />
            <div>
              <Text strong>Detalles de esta versión</Text>
              <Paragraph type="secondary" style={{ margin: '3px 0 0', whiteSpace: 'pre-line' }}>
                {estado.notas || 'Incluye mejoras de estabilidad, rendimiento y correcciones generales.'}
              </Paragraph>
              {estado.fecha && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Publicada el {new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(new Date(estado.fecha))}
                </Text>
              )}
            </div>
          </div>

          <Divider style={{ margin: '22px 0 16px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Button type="text" onClick={() => setModalAbierto(false)}>
              Recordármelo más tarde
            </Button>
            <Space>
              <Button onClick={() => setModalAbierto(false)}>Instalar al cerrar</Button>
              <Button type="primary" onClick={() => window.api.instalarActualizacion()}>
                Instalar y reiniciar
              </Button>
            </Space>
          </div>
        </Modal>
      </>
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
