import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Empty,
  Input,
  Result,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography
} from 'antd'
import { ExportOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Publicacion, Visitas as DatosVisitas } from '../../../preload'
import { usePublicaciones } from '../datos/publicaciones'
import { Portada } from '../components/Portada'
import { fechaLegible, normalizar } from '../lib/formato'

const { Paragraph, Text, Title } = Typography

const PERIODOS = [
  { label: '7 días', value: 7 },
  { label: '30 días', value: 30 },
  { label: '90 días', value: 90 },
  { label: '1 año', value: 365 }
]

interface Fila extends Publicacion {
  visitas: number
}

export default function Visitas(): JSX.Element {
  const { publicaciones, colorTema } = usePublicaciones()

  const [dias, setDias] = useState(30)
  const [datos, setDatos] = useState<DatosVisitas | null>(null)
  const [sinConfigurar, setSinConfigurar] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async (): Promise<void> => {
    if (!publicaciones) return
    setCargando(true)
    setError('')
    try {
      const rutas = publicaciones.map((p) => `/${p.slug}`)
      const v = await window.api.leerVisitas(dias, rutas)
      setSinConfigurar(v === null)
      setDatos(v)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCargando(false)
    }
  }, [publicaciones, dias])

  // En desarrollo React monta el efecto dos veces, y con él se duplicaban las
  // peticiones: el doble de llamadas de golpe contra un límite de 4 por segundo
  // era un 429 asegurado. `vivo` descarta la carga que ya no interesa.
  useEffect(() => {
    let vivo = true
    const cargarSiSigueInteresando = async (): Promise<void> => {
      if (!vivo) return
      await cargar()
    }
    cargarSiSigueInteresando()
    return () => {
      vivo = false
    }
  }, [cargar])

  const filas = useMemo<Fila[]>(() => {
    const porRuta = new Map((datos?.porRuta ?? []).map((r) => [r.ruta, r.visitas]))
    const termino = normalizar(busqueda.trim())
    return (publicaciones ?? [])
      // Una reflexión sin visitas no vuelve de la API; aquí se rellena con 0
      // para que la tabla siga siendo el catálogo completo y no solo lo leído.
      .map((p) => ({ ...p, visitas: porRuta.get(`/${p.slug}`) ?? 0 }))
      .filter((p) =>
        termino ? normalizar(`${p.titulo} ${p.categoria}`).includes(termino) : true
      )
      .sort((a, b) => b.visitas - a.visitas || b.fecha.localeCompare(a.fecha))
  }, [publicaciones, datos, busqueda])

  const leidas = filas.filter((f) => f.visitas > 0).length

  if (sinConfigurar) {
    return (
      <Result
        status="info"
        title="Falta configurar la analítica"
        subTitle={
          <>
            Añade el bloque <Text code>goatcounter</Text> con el código del sitio y un token
            de API a <Text code>config.json</Text>. Contacta a Lucas.
          </>
        }
      />
    )
  }

  if (error) {
    return (
      <Result
        status="error"
        title="No se pudieron leer las visitas"
        subTitle={error}
        extra={
          <Button type="primary" onClick={cargar}>
            Intentar de nuevo
          </Button>
        }
      />
    )
  }

  const columnas: ColumnsType<Fila> = [
    {
      title: '',
      dataIndex: 'thumbUrl',
      key: 'thumb',
      width: 88,
      render: (src: string, p) => <Portada src={src} alt={p.titulo} />
    },
    {
      title: 'Reflexión',
      dataIndex: 'titulo',
      key: 'titulo',
      sorter: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
      render: (titulo: string) => <Text strong>{titulo}</Text>
    },
    {
      title: 'Tema',
      dataIndex: 'categoria',
      key: 'categoria',
      width: 200,
      render: (cat: string) => (cat ? <Tag color={colorTema(cat)}>{cat}</Tag> : null)
    },
    {
      title: 'Publicada',
      dataIndex: 'fecha',
      key: 'fecha',
      width: 130,
      sorter: (a, b) => a.fecha.localeCompare(b.fecha),
      render: (fecha: string) => <Text type="secondary">{fechaLegible(fecha)}</Text>
    },
    {
      title: 'Visitas',
      dataIndex: 'visitas',
      key: 'visitas',
      width: 100,
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.visitas - b.visitas,
      render: (v: number) =>
        v > 0 ? <Text strong>{v}</Text> : <Text type="secondary">0</Text>
    },
    {
      title: '',
      key: 'accion',
      width: 56,
      align: 'right',
      render: (_, p) => (
        <Button
          type="text"
          size="small"
          icon={<ExportOutlined />}
          onClick={() => window.api.abrirEnlace(p.url)}
        />
      )
    }
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="baseline" wrap>
        <Title level={5} style={{ margin: 0 }}>
          Visitas
        </Title>
        <Space>
          <Segmented
            options={PERIODOS}
            value={dias}
            onChange={(v) => setDias(v as number)}
            size="small"
          />
          <Button icon={<ReloadOutlined />} loading={cargando} onClick={cargar} size="small">
            Actualizar
          </Button>
        </Space>
      </Space>

      <Space size="large" wrap>
        <Statistic
          title="Páginas vistas en todo el sitio"
          value={datos?.total ?? 0}
          loading={cargando && !datos}
        />
        <Statistic
          title="Reflexiones con alguna lectura"
          value={leidas}
          suffix={`/ ${publicaciones?.length ?? 0}`}
          loading={cargando && !datos}
        />
      </Space>

      <Alert
        type="info"
        showIcon
        message="Qué mide y qué no"
        description="Cuenta cuántas veces se abrió cada reflexión, no quién la abrió: en un sitio público sin registro el visitante es anónimo. El total del sitio incluye la portada y las páginas de tema, por eso es mayor que la suma de la tabla. Las cifras empiezan el 1 de septiembre de 2026, que es cuando se instaló la medición."
        closable
      />

      <Input.Search
        placeholder="Buscar por título o tema…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        allowClear
        style={{ width: 320 }}
      />

      {cargando && !datos ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : filas.length === 0 ? (
        <Empty description="Ninguna reflexión coincide con la búsqueda" />
      ) : (
        <>
          {datos?.total === 0 && (
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Todavía no hay visitas en este periodo. Si la medición se instaló hace poco,
              tarda un par de minutos en registrar las primeras.
            </Paragraph>
          )}
          <Table<Fila>
            rowKey="archivo"
            size="small"
            columns={columnas}
            dataSource={filas}
            onRow={(p) => ({ onDoubleClick: () => window.api.abrirEnlace(p.url) })}
            pagination={{
              pageSize: 50,
              size: 'small',
              showSizeChanger: false,
              hideOnSinglePage: true,
              showTotal: (t, [desde, hasta]) => `${desde}–${hasta} de ${t}`
            }}
          />
        </>
      )}
    </Space>
  )
}
