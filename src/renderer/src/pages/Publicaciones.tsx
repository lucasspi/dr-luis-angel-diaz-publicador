import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Result, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { ExportOutlined, PictureOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Publicacion } from '../../../preload'

const { Text, Title } = Typography

function fechaLegible(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  const fecha = new Date(Number(y), Number(m) - 1, Number(d))
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Sin acentos y en minúsculas, para que "oracion" encuentre "Oración".
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// La portada llega por el esquema propio `reflexion-img://` (ver
// main/lib/imagenes.ts). Puede faltar el archivo: entonces cae al marcador.
function Portada({ src, alt }: { src: string; alt: string }): JSX.Element {
  const [falló, setFalló] = useState(false)

  const marco: React.CSSProperties = {
    width: 72,
    height: 48,
    borderRadius: 4,
    background: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0
  }

  if (!src || falló) {
    return (
      <div style={marco}>
        <PictureOutlined style={{ color: '#bfbfbf' }} />
      </div>
    )
  }

  return (
    <div style={marco}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFalló(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  )
}

export default function Publicaciones(): JSX.Element {
  const [publicaciones, setPublicaciones] = useState<Publicacion[] | null>(null)
  const [error, setError] = useState('')
  const [avisoSync, setAvisoSync] = useState('')
  const [sincronizando, setSincronizando] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  async function cargar(sincronizarAntes: boolean): Promise<void> {
    if (sincronizarAntes) setSincronizando(true)
    try {
      const resultado = await window.api.listarPublicaciones(sincronizarAntes)
      setPublicaciones(resultado.publicaciones)
      setAvisoSync(resultado.avisoSync)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSincronizando(false)
    }
  }

  useEffect(() => {
    cargar(false)
  }, [])

  const categorias = useMemo(() => {
    const vistas = new Set((publicaciones ?? []).map((p) => p.categoria).filter(Boolean))
    return [...vistas].sort((a, b) => a.localeCompare(b, 'es'))
  }, [publicaciones])

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda.trim())
    if (!termino) return publicaciones ?? []
    return (publicaciones ?? []).filter((p) =>
      normalizar(`${p.titulo} ${p.resumen} ${p.categoria}`).includes(termino)
    )
  }, [publicaciones, busqueda])

  if (error) {
    return (
      <Result
        status="error"
        title="No se pudo leer la lista"
        subTitle={error}
        extra={
          <Button type="primary" onClick={() => cargar(false)}>
            Intentar de nuevo
          </Button>
        }
      />
    )
  }

  const columnas: ColumnsType<Publicacion> = [
    {
      title: '',
      dataIndex: 'thumbUrl',
      key: 'thumb',
      width: 88,
      render: (src: string, p) => <Portada src={src} alt={p.titulo} />
    },
    {
      title: 'Título',
      dataIndex: 'titulo',
      key: 'titulo',
      sorter: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
      render: (titulo: string, p) => (
        <Tooltip title={p.resumen || undefined} mouseEnterDelay={0.5}>
          <Text strong>{titulo}</Text>
        </Tooltip>
      )
    },
    {
      title: 'Fecha',
      dataIndex: 'fecha',
      key: 'fecha',
      width: 140,
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.fecha.localeCompare(b.fecha),
      render: (fecha: string) => <Text type="secondary">{fechaLegible(fecha)}</Text>
    },
    {
      title: 'Tema',
      dataIndex: 'categoria',
      key: 'categoria',
      width: 220,
      filters: categorias.map((c) => ({ text: c, value: c })),
      onFilter: (valor, p) => p.categoria === valor,
      render: (categoria: string) => (categoria ? <Tag>{categoria}</Tag> : null)
    },
    {
      title: '',
      key: 'accion',
      width: 72,
      align: 'right',
      render: (_, p) => (
        <Button
          type="text"
          size="small"
          icon={<ExportOutlined />}
          onClick={() => window.api.abrirEnlace(p.url)}
        >
          Ver
        </Button>
      )
    }
  ]

  const total = publicaciones?.length ?? 0
  const filtrando = busqueda.trim() !== ''

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="baseline" wrap>
        <Title level={5} style={{ margin: 0 }}>
          {total} reflexion{total === 1 ? '' : 'es'} en el sitio
          {filtrando && (
            <Text type="secondary" style={{ fontWeight: 400 }}>
              {' '}
              · {visibles.length} coincide{visibles.length === 1 ? '' : 'n'}
            </Text>
          )}
        </Title>
        <Button
          icon={<ReloadOutlined />}
          loading={sincronizando}
          onClick={() => cargar(true)}
          size="small"
        >
          Sincronizar
        </Button>
      </Space>

      {avisoSync && (
        <Alert
          type="warning"
          showIcon
          message="La lista puede estar atrasada"
          description={
            <>
              No se pudo traer lo último del sitio, así que ves la última copia descargada.
              <br />
              <Text code style={{ fontSize: 12 }}>
                {avisoSync}
              </Text>
            </>
          }
          closable
          onClose={() => setAvisoSync('')}
        />
      )}

      <Input.Search
        placeholder="Buscar por título, resumen o tema…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        allowClear
      />

      <Table<Publicacion>
        rowKey="slug"
        size="small"
        loading={publicaciones === null}
        columns={columnas}
        dataSource={visibles}
        onRow={(p) => ({
          onDoubleClick: () => window.api.abrirEnlace(p.url),
          style: { cursor: 'default' }
        })}
        pagination={{
          pageSize: 50,
          size: 'small',
          showSizeChanger: false,
          hideOnSinglePage: true,
          showTotal: (t, [desde, hasta]) => `${desde}–${hasta} de ${t}`
        }}
        locale={{ emptyText: 'Ninguna reflexión coincide con la búsqueda' }}
      />
    </Space>
  )
}
