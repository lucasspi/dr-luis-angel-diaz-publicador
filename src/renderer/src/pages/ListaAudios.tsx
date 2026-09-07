import { useEffect, useState } from 'react'
import { Alert, Button, Empty, Popconfirm, message, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons'
import { DialogoAudio } from '../components/DialogoAudio'
import type { Oracion, Tema } from '../../../preload'
import { Encabezado } from '../components/Encabezado'

const mb = (n: number): string => `${(n / 1000000).toFixed(1)} MB`
const duracion = (n: number): string => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

// La tabla del catálogo (content/oraciones.json del sitio), con el tema resuelto
// contra temas.json. Doble clic (o el lápiz) edita título, descripción y tema.
export default function ListaAudios(): JSX.Element {
  const [oraciones, setOraciones] = useState<Oracion[]>([])
  const [temas, setTemas] = useState<Tema[]>([])
  const [editando, setEditando] = useState<Oracion | null>(null)
  const [eliminando, setEliminando] = useState('')
  async function eliminar(o: Oracion): Promise<void> {
    setEliminando(o.id); setError('')
    try { await window.api.borrarAudio(o.id); await cargar(); void message.success('Oración eliminada. El sitio se actualizará en unos minutos.') }
    catch (e) { setError(mensaje(e)) } finally { setEliminando('') }
  }
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const cargar = async (): Promise<void> => {
    setCargando(true); setError('')
    try {
      const [lista, listaTemas] = await Promise.all([window.api.listarAudios(), window.api.listarTemas()])
      setOraciones(lista); setTemas(listaTemas)
    } catch (e) { setError(mensaje(e)) } finally { setCargando(false) }
  }
  useEffect(() => { void cargar() }, [])
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Encabezado
        titulo="Audios"
        descripcion="Las oraciones en audio publicadas en el sitio. Un envío reciente puede tardar unos minutos en verse."
        acciones={
          <>
            <Typography.Text type="secondary">{`${oraciones.length} oraci${oraciones.length === 1 ? 'ón' : 'ones'}`}</Typography.Text>
            <Button icon={<ReloadOutlined />} loading={cargando} onClick={() => void cargar()}>Actualizar</Button>
          </>
        }
      />
      {error && <Alert type="error" showIcon message={error} />}
      <Table<Oracion>
        rowKey="id"
        size="small"
        dataSource={oraciones}
        loading={cargando}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        onRow={o => ({ onDoubleClick: () => setEditando(o) })}
        locale={{ emptyText: <Empty description="Todavía no hay oraciones" /> }}
        columns={[
          { title: 'Título', dataIndex: 'titulo', render: (t: string, o) => <><Typography.Text strong>{t}</Typography.Text>{o.descripcion && <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>{o.descripcion}</Typography.Paragraph>}</> },
          { title: 'Tema', dataIndex: 'temaId', width: 200, render: (id?: string) => id ? <Tag>{temas.find(t => t.id === id)?.nombre ?? id}</Tag> : <Typography.Text type="secondary">—</Typography.Text> },
          { title: 'Fecha', dataIndex: 'fecha', width: 120, render: (f: string) => new Date(f).toLocaleDateString('es'), sorter: (a, b) => a.fecha.localeCompare(b.fecha), defaultSortOrder: 'descend' },
          { title: 'Duración', dataIndex: 'duracion', width: 100, render: duracion },
          { title: 'Tamaño', dataIndex: 'bytes', width: 100, render: mb },
          { title: 'Texto', dataIndex: 'transcripcion', width: 80, render: (t?: string) => t ? 'Sí' : 'No' },
          { title: 'Portada', dataIndex: 'imagen', width: 90, render: (t?: string) => t ? 'Sí' : 'No' },
          { key: 'acciones', width: 180, align: 'right', render: (_, o) => <Space size={0}>
            <Tooltip title="Editar título, descripción y tema"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditando(o)} /></Tooltip>
            <Tooltip title="Ver en el sitio"><Button type="text" size="small" icon={<ExportOutlined />} onClick={() => window.api.abrirEnlace(`https://drluisangeldiaz.com/oraciones/${o.slug}`)} /></Tooltip>
            <Popconfirm title="¿Eliminar esta oración?" description={`«${o.titulo}» se quitará del sitio junto con su audio, portada y texto.`} okText="Sí, eliminar" cancelText="Conservar" okButtonProps={{ danger: true }} onConfirm={() => eliminar(o)}>
              <Button danger type="text" size="small" icon={<DeleteOutlined />} loading={eliminando === o.id} disabled={!!eliminando && eliminando !== o.id}>Eliminar</Button>
            </Popconfirm>
          </Space> }
        ]}
      />
      <DialogoAudio oracion={editando} temas={temas} onCerrar={() => setEditando(null)} onListo={cargar} />
    </Space>
  )
}
