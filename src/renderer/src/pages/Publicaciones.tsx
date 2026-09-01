import { useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Input, Result, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import type { Publicacion } from '../../../preload'
import { usePublicaciones } from '../datos/publicaciones'
import { CabeceraLista } from '../components/CabeceraLista'
import { Portada } from '../components/Portada'
import { fechaLegible, normalizar } from '../lib/formato'

const { RangePicker } = DatePicker
const { Text } = Typography

const TODOS = '__todos__'

type Rango = [Dayjs, Dayjs] | null

// Los mismos atajos del calendario de referencia, en el orden en que se usan:
// primero lo reciente, después el corte por mes y año.
//
// Se calculan en cada render y no una vez a nivel de módulo, por dos razones:
// el módulo se evalúa antes de que main.tsx fije el locale español (y "esta
// semana" empezaría en domingo en vez de lunes), y el app puede quedar abierto
// pasada la medianoche, con lo que los rangos quedarían viejos.
function atajos(): { label: string; value: [Dayjs, Dayjs] }[] {
  return [
    { label: 'Esta semana', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
    {
      label: 'Semana pasada',
      value: [
        dayjs().subtract(1, 'week').startOf('week'),
        dayjs().subtract(1, 'week').endOf('week')
      ]
    },
    { label: 'Últimos 30 días', value: [dayjs().subtract(29, 'day'), dayjs()] },
    { label: 'Este mes', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
    { label: 'Últimos 3 meses', value: [dayjs().subtract(3, 'month'), dayjs()] },
    { label: 'Este año', value: [dayjs().startOf('year'), dayjs().endOf('year')] }
  ]
}

export default function Publicaciones(): JSX.Element {
  const { publicaciones, error, categorias, colorTema, recargar } = usePublicaciones()

  const [busqueda, setBusqueda] = useState('')
  const [rango, setRango] = useState<Rango>(null)
  const [categoria, setCategoria] = useState(TODOS)
  const [pagina, setPagina] = useState(1)

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda.trim())
    // `fecha` ya viene normalizada a YYYY-MM-DD, así que comparar como texto
    // ordena igual que comparar como fecha — y evita zonas horarias.
    const desde = rango ? rango[0].format('YYYY-MM-DD') : ''
    const hasta = rango ? rango[1].format('YYYY-MM-DD') : ''

    return (publicaciones ?? []).filter((p) => {
      if (categoria !== TODOS && p.categoria !== categoria) return false
      if (desde && (p.fecha < desde || p.fecha > hasta)) return false
      if (!termino) return true
      return normalizar(`${p.titulo} ${p.resumen} ${p.categoria}`).includes(termino)
    })
  }, [publicaciones, busqueda, rango, categoria])

  // Con menos resultados, la página en la que estabas puede dejar de existir.
  useEffect(() => {
    setPagina(1)
  }, [busqueda, rango, categoria])

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
      render: (cat: string) => (cat ? <Tag color={colorTema(cat)}>{cat}</Tag> : null)
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

  const filtrando = busqueda.trim() !== '' || rango !== null || categoria !== TODOS

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <CabeceraLista
        recuento={`${visibles.length} reflexion${visibles.length === 1 ? '' : 'es'}`}
      />

      <Space wrap style={{ width: '100%' }}>
        <Input.Search
          placeholder="Buscar por título, resumen o tema…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          allowClear
          style={{ width: 300 }}
        />
        <RangePicker
          value={rango}
          onChange={(valores) =>
            setRango(valores && valores[0] && valores[1] ? [valores[0], valores[1]] : null)
          }
          presets={atajos()}
          format="DD/MM/YYYY"
          placeholder={['Desde', 'Hasta']}
          allowClear
        />
        {/* El chip del desplegable va del mismo color que el de la tabla, para
            que se vea de un golpe qué filas va a dejar el filtro. */}
        <Select
          value={categoria}
          onChange={setCategoria}
          style={{ width: 220 }}
          options={[
            { value: TODOS, label: 'Todos los temas' },
            ...categorias.map((c) => ({
              value: c,
              label: (
                <Tag color={colorTema(c)} style={{ marginInlineEnd: 0 }}>
                  {c}
                </Tag>
              )
            }))
          ]}
        />
        {filtrando && (
          <Button
            type="link"
            size="small"
            onClick={() => {
              setBusqueda('')
              setRango(null)
              setCategoria(TODOS)
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </Space>

      <Table<Publicacion>
        rowKey="slug"
        size="small"
        loading={publicaciones === null}
        columns={columnas}
        dataSource={visibles}
        onRow={(p) => ({ onDoubleClick: () => window.api.abrirEnlace(p.url) })}
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
          emptyText: filtrando
            ? 'Ninguna reflexión coincide con los filtros'
            : 'Todavía no hay reflexiones publicadas'
        }}
      />
    </Space>
  )
}
