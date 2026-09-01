import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  DatePicker,
  Input,
  Result,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from 'antd'
import { ExportOutlined, PictureOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import type { Publicacion } from '../../../preload'

const { RangePicker } = DatePicker
const { Text, Title } = Typography

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
  const [rango, setRango] = useState<Rango>(null)
  const [categoria, setCategoria] = useState(TODOS)
  const [pagina, setPagina] = useState(1)

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

  function limpiarFiltros(): void {
    setBusqueda('')
    setRango(null)
    setCategoria(TODOS)
  }

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
      render: (cat: string) => (cat ? <Tag>{cat}</Tag> : null)
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
  const filtrando = busqueda.trim() !== '' || rango !== null || categoria !== TODOS

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
        <Select
          value={categoria}
          onChange={setCategoria}
          style={{ width: 220 }}
          options={[
            { value: TODOS, label: 'Todos los temas' },
            ...categorias.map((c) => ({ value: c, label: c }))
          ]}
        />
        {filtrando && (
          <Button type="link" size="small" onClick={limpiarFiltros}>
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
