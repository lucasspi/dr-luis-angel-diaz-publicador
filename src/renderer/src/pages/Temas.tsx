import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Result, Space, Table, Typography } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { usePublicaciones } from '../datos/publicaciones'
import { CabeceraLista } from '../components/CabeceraLista'
import { Portada } from '../components/Portada'
import { fechaLegible, normalizar } from '../lib/formato'

const { Text } = Typography

const BASE_URL = 'https://drluisangeldiaz.com'

interface Tema {
  nombre: string
  slug: string
  /** La portada de la reflexión más reciente del tema. */
  thumbUrl: string
  cantidad: number
  primera: string
  ultima: string
  url: string
}

export default function Temas(): JSX.Element {
  const { publicaciones, error, recargar } = usePublicaciones()

  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)

  // Los temas salen de las reflexiones publicadas, no de una lista aparte: en
  // el sitio un tema solo existe (y solo gana su página /categoria/{slug})
  // cuando alguna reflexión publicada lo usa.
  const temas = useMemo<Tema[]>(() => {
    const porNombre = new Map<string, Tema>()

    for (const p of publicaciones ?? []) {
      if (!p.categoria) continue
      const previo = porNombre.get(p.categoria)
      if (!previo) {
        porNombre.set(p.categoria, {
          nombre: p.categoria,
          slug: p.categoriaSlug,
          thumbUrl: p.thumbUrl,
          cantidad: 1,
          primera: p.fecha,
          ultima: p.fecha,
          url: `${BASE_URL}/categoria/${p.categoriaSlug}`
        })
        continue
      }
      previo.cantidad += 1
      if (p.fecha < previo.primera) previo.primera = p.fecha
      if (p.fecha > previo.ultima) {
        previo.ultima = p.fecha
        previo.thumbUrl = p.thumbUrl
      }
    }

    return [...porNombre.values()].sort((a, b) => b.cantidad - a.cantidad)
  }, [publicaciones])

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda.trim())
    if (!termino) return temas
    return temas.filter((t) => normalizar(t.nombre).includes(termino))
  }, [temas, busqueda])

  useEffect(() => {
    setPagina(1)
  }, [busqueda])

  if (error) {
    return (
      <Result
        status="error"
        title="No se pudo leer la lista"
        subTitle={error}
        extra={
          <Button type="primary" onClick={() => recargar(false)}>
            Intentar de nuevo
          </Button>
        }
      />
    )
  }

  const columnas: ColumnsType<Tema> = [
    {
      title: '',
      dataIndex: 'thumbUrl',
      key: 'thumb',
      width: 88,
      render: (src: string, t) => <Portada src={src} alt={t.nombre} />
    },
    {
      title: 'Tema',
      dataIndex: 'nombre',
      key: 'nombre',
      sorter: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
      // Sin chip de color: aquí cada fila ya es un tema, así que el color no
      // distingue nada. En Publicaciones sí, porque van mezclados entre sí.
      render: (nombre: string) => <Text strong>{nombre}</Text>
    },
    {
      title: 'Reflexiones',
      dataIndex: 'cantidad',
      key: 'cantidad',
      width: 130,
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.cantidad - b.cantidad,
      render: (cantidad: number) => <Text strong>{cantidad}</Text>
    },
    {
      title: 'Primera',
      dataIndex: 'primera',
      key: 'primera',
      width: 140,
      sorter: (a, b) => a.primera.localeCompare(b.primera),
      render: (fecha: string) => <Text type="secondary">{fechaLegible(fecha)}</Text>
    },
    {
      title: 'Última',
      dataIndex: 'ultima',
      key: 'ultima',
      width: 140,
      sorter: (a, b) => a.ultima.localeCompare(b.ultima),
      render: (fecha: string) => <Text type="secondary">{fechaLegible(fecha)}</Text>
    },
    {
      title: '',
      key: 'accion',
      width: 72,
      align: 'right',
      render: (_, t) => (
        <Button
          type="text"
          size="small"
          icon={<ExportOutlined />}
          onClick={() => window.api.abrirEnlace(t.url)}
        >
          Ver
        </Button>
      )
    }
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <CabeceraLista recuento={`${visibles.length} tema${visibles.length === 1 ? '' : 's'}`} />

      <Space wrap style={{ width: '100%' }}>
        <Input.Search
          placeholder="Buscar tema…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          allowClear
          style={{ width: 300 }}
        />
        {busqueda.trim() !== '' && (
          <Button type="link" size="small" onClick={() => setBusqueda('')}>
            Limpiar filtros
          </Button>
        )}
      </Space>

      <Table<Tema>
        rowKey="slug"
        size="small"
        loading={publicaciones === null}
        columns={columnas}
        dataSource={visibles}
        onRow={(t) => ({ onDoubleClick: () => window.api.abrirEnlace(t.url) })}
        pagination={{
          current: pagina,
          onChange: setPagina,
          pageSize: 50,
          size: 'small',
          showSizeChanger: false,
          hideOnSinglePage: true,
          showTotal: (t, [desde, hasta]) => `${desde}–${hasta} de ${t}`
        }}
        locale={{
          emptyText:
            busqueda.trim() !== ''
              ? 'Ningún tema coincide con la búsqueda'
              : 'Todavía no hay temas en uso'
        }}
      />
    </Space>
  )
}
