import { useEffect, useMemo, useState } from 'react'
import { Alert, App, Button, Input, Modal, Result, Space, Table, Tooltip, Typography } from 'antd'
import { EditOutlined, ExportOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { usePublicaciones } from '../datos/publicaciones'
import { CabeceraLista } from '../components/CabeceraLista'
import { Portada } from '../components/Portada'
import { fechaLegible, normalizar } from '../lib/formato'

const { Paragraph, Text } = Typography

const BASE_URL = 'https://drluisangeldiaz.com'

interface Fila {
  id: string
  nombre: string
  slug: string
  /** La portada de la reflexión más reciente del tema. */
  thumbUrl: string
  cantidad: number
  primera: string
  ultima: string
  url: string
}

/**
 * Renombrar solo toca `nombre` en content/temas.json. Ni el `id` (que es lo
 * que referencian las reflexiones) ni el `slug` (que es la URL) se mueven, así
 * que no se reescribe ningún post y nadie pierde el enlace que tenía.
 */
function DialogoRenombrar({
  tema,
  onCerrar,
  onListo
}: {
  tema: Fila | null
  onCerrar: () => void
  onListo: () => Promise<void>
}): JSX.Element {
  const { notification } = App.useApp()
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setNombre(tema?.nombre ?? '')
    setError('')
  }, [tema])

  const limpio = nombre.trim()
  const cambió = tema !== null && limpio !== '' && limpio !== tema.nombre

  async function guardar(): Promise<void> {
    if (!tema || !cambió) return
    setGuardando(true)
    setError('')
    try {
      await window.api.renombrarTema(tema.id, limpio)
      await onListo()
      // Aviso que se queda, no un toast que se va: el cambio ya está subido
      // pero el sitio tarda en reconstruirse, y sin decirlo parece que no pasó
      // nada cuando abres la página y sigue el nombre viejo.
      notification.success({
        message: 'Nombre cambiado y publicado',
        description: (
          <>
            El sitio tarda <b>1–2 minutos</b> en reconstruirse. Hasta entonces,{' '}
            <Text code style={{ fontSize: 12 }}>
              /categoria/{tema.slug}
            </Text>{' '}
            todavía muestra «{tema.nombre}».
          </>
        ),
        duration: 12,
        placement: 'bottomRight'
      })
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      open={tema !== null}
      title="Cambiar el nombre del tema"
      okText="Guardar y publicar"
      cancelText="Cancelar"
      onCancel={onCerrar}
      onOk={guardar}
      okButtonProps={{ disabled: !cambió, loading: guardando }}
      cancelButtonProps={{ disabled: guardando }}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: '100%', paddingTop: 8 }}>
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onPressEnter={guardar}
          placeholder="Nombre del tema"
          autoFocus
          disabled={guardando}
        />

        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
          Cambia solo la etiqueta que ve el lector, en {tema?.cantidad ?? 0} reflexión
          {(tema?.cantidad ?? 0) === 1 ? '' : 'es'}. La dirección de la página <b>no</b> se mueve:
          <br />
          <Text code style={{ fontSize: 12 }}>
            /categoria/{tema?.slug}
          </Text>
        </Paragraph>

        <Alert
          type="info"
          showIcon
          message="Se publica solo"
          description="Al guardar, el cambio se sube al sitio sin que tengas que hacer nada más. Tarda 1–2 minutos en verse: el sitio se reconstruye entero cada vez."
        />

        {error && <Alert type="error" showIcon message={error} />}
      </Space>
    </Modal>
  )
}

export default function Temas(): JSX.Element {
  const { publicaciones, temas, error, recargar } = usePublicaciones()

  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [editando, setEditando] = useState<Fila | null>(null)

  // El registro manda la identidad; las reflexiones ponen los números. Un tema
  // dado de alta que todavía nadie usó sale con 0 — el sitio no le genera
  // página, pero tiene que poder renombrarse igual.
  const filas = useMemo<Fila[]>(() => {
    const porId = new Map<string, Fila>(
      temas.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        slug: t.slug,
        thumbUrl: '',
        cantidad: 0,
        primera: '',
        ultima: '',
        url: `${BASE_URL}/categoria/${t.slug}`
      })).map((f) => [f.id, f])
    )

    for (const p of publicaciones ?? []) {
      if (!p.temaId) continue
      let fila = porId.get(p.temaId)
      if (!fila) {
        // Un post estrenando un tema que el registro aún no tiene (publicado
        // desde un app sin actualizar). Se muestra igual.
        fila = {
          id: p.temaId,
          nombre: p.categoria,
          slug: p.categoriaSlug,
          thumbUrl: '',
          cantidad: 0,
          primera: '',
          ultima: '',
          url: `${BASE_URL}/categoria/${p.categoriaSlug}`
        }
        porId.set(p.temaId, fila)
      }
      fila.cantidad += 1
      if (!fila.primera || p.fecha < fila.primera) fila.primera = p.fecha
      if (!fila.ultima || p.fecha > fila.ultima) {
        fila.ultima = p.fecha
        fila.thumbUrl = p.thumbUrl
      }
    }

    return [...porId.values()].sort((a, b) => b.cantidad - a.cantidad)
  }, [temas, publicaciones])

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda.trim())
    if (!termino) return filas
    return filas.filter((f) => normalizar(f.nombre).includes(termino))
  }, [filas, busqueda])

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

  const columnas: ColumnsType<Fila> = [
    {
      title: '',
      dataIndex: 'thumbUrl',
      key: 'thumb',
      width: 88,
      render: (src: string, f) => <Portada src={src} alt={f.nombre} />
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
      render: (cantidad: number) =>
        cantidad > 0 ? <Text strong>{cantidad}</Text> : <Text type="secondary">0</Text>
    },
    {
      title: 'Primera',
      dataIndex: 'primera',
      key: 'primera',
      width: 140,
      sorter: (a, b) => a.primera.localeCompare(b.primera),
      render: (fecha: string) => <Text type="secondary">{fechaLegible(fecha) || '—'}</Text>
    },
    {
      title: 'Última',
      dataIndex: 'ultima',
      key: 'ultima',
      width: 140,
      sorter: (a, b) => a.ultima.localeCompare(b.ultima),
      render: (fecha: string) => <Text type="secondary">{fechaLegible(fecha) || '—'}</Text>
    },
    {
      title: '',
      key: 'acciones',
      width: 96,
      align: 'right',
      render: (_, f) => (
        <Space size={0}>
          <Tooltip title="Cambiar el nombre">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setEditando(f)}
            />
          </Tooltip>
          <Tooltip
            title={
              f.cantidad > 0
                ? 'Ver en el sitio'
                : 'Sin reflexiones todavía — el sitio no le genera página'
            }
          >
            {/* El span deja que el tooltip funcione con el botón deshabilitado. */}
            <span>
              <Button
                type="text"
                size="small"
                icon={<ExportOutlined />}
                disabled={f.cantidad === 0}
                onClick={() => window.api.abrirEnlace(f.url)}
              />
            </span>
          </Tooltip>
        </Space>
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

      <Table<Fila>
        rowKey="id"
        size="small"
        loading={publicaciones === null}
        columns={columnas}
        dataSource={visibles}
        onRow={(f) => ({ onDoubleClick: () => setEditando(f) })}
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
              : 'Todavía no hay temas'
        }}
      />

      <DialogoRenombrar
        tema={editando}
        onCerrar={() => setEditando(null)}
        onListo={() => recargar(false)}
      />
    </Space>
  )
}
