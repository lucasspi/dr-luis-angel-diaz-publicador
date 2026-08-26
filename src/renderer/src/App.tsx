import { useEffect, useState } from 'react'
import { Button, ConfigProvider, Input, Result, Space, Spin, Tag, Typography, Upload } from 'antd'
import { FileTextOutlined, InboxOutlined } from '@ant-design/icons'
import esES from 'antd/locale/es_ES'
import type { RcFile } from 'antd/es/upload'

const { Dragger } = Upload
const { Title, Paragraph, Text } = Typography

type Estado =
  | { fase: 'cargando' }
  | { fase: 'sin-configurar'; configPath: string }
  | { fase: 'listo' }
  | { fase: 'elegir-categoria'; filePath: string; nombreArchivo: string; categorias: string[] }
  | { fase: 'procesando'; pasos: string[] }
  | { fase: 'exito'; url: string }
  | { fase: 'error'; mensaje: string }

type EstadoUpdate =
  | { fase: 'inactivo' }
  | { fase: 'buscando' }
  | { fase: 'no-disponible' }
  | { fase: 'disponible'; version: string }
  | { fase: 'descargando'; porcentaje: number }
  | { fase: 'descargada'; version: string }
  | { fase: 'error'; mensaje: string }

function BarraActualizacion({ estado }: { estado: EstadoUpdate }): JSX.Element {
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
      <Space direction="vertical" size={2}>
        <Text type="danger">No se pudo buscar actualizaciones.</Text>
        <Button size="small" type="text" onClick={() => window.api.buscarActualizaciones()}>
          Reintentar
        </Button>
      </Space>
    )
  }
  return (
    <Space direction="vertical" size={2}>
      {estado.fase === 'no-disponible' && <Text type="secondary">Ya tienes la última versión.</Text>}
      <Button size="small" type="text" onClick={() => window.api.buscarActualizaciones()}>
        Buscar actualizaciones
      </Button>
    </Space>
  )
}

// Un paso intermedio entre soltar el documento y publicar: elegir el tema.
// Chips con las categorías que ya existen en el sitio (para reutilizarlas) o
// un campo libre para estrenar una nueva.
function ElegirCategoria({
  nombreArchivo,
  categorias,
  onPublicar,
  onCancelar
}: {
  nombreArchivo: string
  categorias: string[]
  onPublicar: (categoria: string) => void
  onCancelar: () => void
}): JSX.Element {
  const [elegida, setElegida] = useState('')
  const [nueva, setNueva] = useState('')

  const categoriaFinal = nueva.trim() || elegida

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', padding: '8px 0' }}>
      <Paragraph style={{ marginBottom: 0, textAlign: 'center' }}>
        <FileTextOutlined /> <Text strong>{nombreArchivo}</Text>
      </Paragraph>

      <div>
        <Paragraph style={{ marginBottom: 8 }}>¿Cuál es el tema de esta reflexión?</Paragraph>
        {categorias.length > 0 && (
          <Space size={[4, 8]} wrap style={{ marginBottom: 12 }}>
            {categorias.map((cat) => (
              <Tag.CheckableTag
                key={cat}
                checked={!nueva.trim() && elegida === cat}
                onChange={() => {
                  setElegida(cat)
                  setNueva('')
                }}
                style={{ fontSize: 14, padding: '4px 12px', border: '1px solid #d9d9d9' }}
              >
                {cat}
              </Tag.CheckableTag>
            ))}
          </Space>
        )}
        <Input
          placeholder={categorias.length > 0 ? 'O escribe un tema nuevo…' : 'Ej.: Ministerio, Oración, Familia…'}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onPressEnter={() => categoriaFinal && onPublicar(categoriaFinal)}
          allowClear
        />
      </div>

      <Space style={{ justifyContent: 'center', width: '100%' }}>
        <Button onClick={onCancelar}>Cancelar</Button>
        <Button type="primary" disabled={!categoriaFinal} onClick={() => onPublicar(categoriaFinal)}>
          Publicar{categoriaFinal ? ` en «${categoriaFinal}»` : ''}
        </Button>
      </Space>
    </Space>
  )
}

export default function App(): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [estadoUpdate, setEstadoUpdate] = useState<EstadoUpdate>({ fase: 'inactivo' })

  useEffect(() => {
    window.api.obtenerConfig().then(({ configurado, configPath }) => {
      setEstado(configurado ? { fase: 'listo' } : { fase: 'sin-configurar', configPath })
    })
    return window.api.onEstadoActualizacion(setEstadoUpdate)
  }, [])

  async function elegirCategoria(filePath: string): Promise<void> {
    const nombreArchivo = filePath.split('/').pop() ?? filePath
    let categorias: string[] = []
    try {
      categorias = await window.api.listarCategorias()
    } catch {
      // sin lista no se bloquea nada — el campo libre alcanza
    }
    setEstado({ fase: 'elegir-categoria', filePath, nombreArchivo, categorias })
  }

  async function procesar(filePath: string, categoria: string): Promise<void> {
    setEstado({ fase: 'procesando', pasos: [] })
    const quitarListener = window.api.onProgreso((mensaje) => {
      setEstado((prev) => (prev.fase === 'procesando' ? { fase: 'procesando', pasos: [...prev.pasos, mensaje] } : prev))
    })
    try {
      const { url } = await window.api.procesarDocumento(filePath, categoria)
      setEstado({ fase: 'exito', url })
    } catch (err) {
      setEstado({ fase: 'error', mensaje: err instanceof Error ? err.message : String(err) })
    } finally {
      quitarListener()
    }
  }

  return (
    <ConfigProvider locale={esES}>
      <div style={{ padding: 32, maxWidth: 560, margin: '0 auto' }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          Publicador de reflexiones
        </Title>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <BarraActualizacion estado={estadoUpdate} />
        </div>

        {estado.fase === 'cargando' && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        )}

        {estado.fase === 'sin-configurar' && (
          <Result
            status="warning"
            title="Falta configurar la aplicación"
            subTitle={
              <>
                Contacta a Lucas. Archivo esperado:
                <br />
                <Text code>{estado.configPath}</Text>
              </>
            }
          />
        )}

        {estado.fase === 'listo' && (
          <Dragger
            multiple={false}
            accept=".docx,.pdf"
            showUploadList={false}
            beforeUpload={(file: RcFile) => {
              const filePath = window.api.getPathForFile(file)
              elegirCategoria(filePath)
              return false
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Arrastra aquí el documento (Word o PDF)</p>
            <p className="ant-upload-hint">O haz clic para elegirlo</p>
          </Dragger>
        )}

        {estado.fase === 'elegir-categoria' && (
          <ElegirCategoria
            nombreArchivo={estado.nombreArchivo}
            categorias={estado.categorias}
            onPublicar={(categoria) => procesar(estado.filePath, categoria)}
            onCancelar={() => setEstado({ fase: 'listo' })}
          />
        )}

        {estado.fase === 'procesando' && (
          <Space direction="vertical" style={{ width: '100%', padding: '24px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <Spin />
            </div>
            {estado.pasos.map((paso, i) => (
              <Paragraph key={i} style={{ marginBottom: 4 }}>
                {paso}
              </Paragraph>
            ))}
          </Space>
        )}

        {estado.fase === 'exito' && (
          <Result
            status="success"
            title="¡Reflexión publicada!"
            subTitle="Puede tardar 1–2 minutos en aparecer en el sitio."
            extra={[
              <Button key="ver" type="primary" onClick={() => window.api.abrirEnlace(estado.url)}>
                Ver la reflexión
              </Button>,
              <Button key="otra" onClick={() => setEstado({ fase: 'listo' })}>
                Publicar otra reflexión
              </Button>
            ]}
          />
        )}

        {estado.fase === 'error' && (
          <Result
            status="error"
            title="Algo salió mal"
            subTitle={estado.mensaje}
            extra={
              <Button type="primary" onClick={() => setEstado({ fase: 'listo' })}>
                Intentar de nuevo
              </Button>
            }
          />
        )}
      </div>
    </ConfigProvider>
  )
}
