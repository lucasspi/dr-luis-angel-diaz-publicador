import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Input, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { ListaSuscriptores, Suscriptor } from '../../../preload'

const estados = {
  activo: { texto: 'Suscrito', color: 'success' },
  baja: { texto: 'Dado de baja', color: 'default' },
  pendiente: { texto: 'Pendiente de sincronizar', color: 'processing' },
  retirado: { texto: 'Retirado', color: 'default' }
}
const fecha = (v: string): string => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })
}
export default function Suscriptores(): JSX.Element {
  const [datos, setDatos] = useState<ListaSuscriptores | null>()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('todos')
  const [pagina, setPagina] = useState(1)
  async function cargar(): Promise<void> {
    setCargando(true); setError('')
    try { setDatos(await window.api.listarSuscriptores()) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setCargando(false) }
  }
  useEffect(() => { void cargar() }, [])
  const filas = datos?.suscriptores || []
  const texto = busqueda.trim().toLocaleLowerCase()
  const filtradas = filas.filter(s => (estado === 'todos' || s.estado === estado) &&
    `${s.nombre} ${s.email}`.toLocaleLowerCase().includes(texto))
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Row justify="space-between" align="middle">
      <Col><Typography.Title level={3} style={{ margin: 0 }}>Suscriptores</Typography.Title>
        <Typography.Text type="secondary">Las personas que quieren recibir las nuevas reflexiones por correo.</Typography.Text></Col>
      <Col><Button icon={<ReloadOutlined />} loading={cargando} onClick={() => void cargar()}>Actualizar</Button></Col>
    </Row>
    {error && <Alert type="error" showIcon message="No se pudo actualizar la lista" description={error} />}
    {datos === null && <Alert type="info" showIcon message="Conectemos la lista de suscriptores"
      description="Los registros siguen guardados en Google Sheets. Lucas debe conectar la lista para consultarla desde aquí." />}
    {datos && <>
      <Row gutter={16}>
        <Col span={8}><Card><Statistic title="Registrados" value={filas.length} /></Card></Col>
        <Col span={8}><Card><Statistic title="Suscritos" value={filas.filter(s => s.estado === 'activo').length} /></Card></Col>
        <Col span={8}><Card><Statistic title="Dados de baja o retirados" value={filas.filter(s => ['baja', 'retirado'].includes(s.estado)).length} /></Card></Col>
      </Row>
      <Alert showIcon type={datos.servicio.error ? 'warning' : datos.servicio.activo && datos.servicio.inicializado ? 'success' : 'info'}
        message={datos.servicio.activo && datos.servicio.inicializado ? 'Avisos automáticos activados' : 'El envío de avisos todavía no está activado'}
        description={<>{datos.servicio.error || 'Las nuevas reflexiones se revisan dos veces al día (cada 12 horas). Las bajas se respetan automáticamente.'}
          <br />Última revisión completada: {fecha(datos.servicio.ultimaRevision)} · Avisos pendientes: {datos.servicio.pendientes}</>} />
      <Space wrap>
        <Input allowClear prefix={<SearchOutlined />} placeholder="Buscar nombre o correo" aria-label="Buscar suscriptores"
          value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1) }} style={{ width: 320 }} />
        <Select value={estado} aria-label="Filtrar por estado" style={{ width: 240 }} onChange={v => { setEstado(v); setPagina(1) }}
          options={[{ value: 'todos', label: 'Todos los estados' }, ...Object.entries(estados).map(([value, e]) => ({ value, label: e.texto }))]} />
        <Typography.Text type="secondary">{filtradas.length} personas</Typography.Text>
      </Space>
      <Table<Suscriptor> rowKey="email" loading={cargando} dataSource={filtradas} scroll={{ x: 850 }}
        locale={{ emptyText: texto || estado !== 'todos' ? 'No hay coincidencias con estos filtros.' : 'Todavía no hay suscriptores registrados.' }}
        pagination={{ current: pagina, onChange: setPagina, defaultPageSize: 25, showSizeChanger: true }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre', render: (v: string) => v || '—', sorter: (a, b) => a.nombre.localeCompare(b.nombre) },
          { title: 'Correo electrónico', dataIndex: 'email', sorter: (a, b) => a.email.localeCompare(b.email) },
          { title: 'Fecha de inscripción', dataIndex: 'fecha', render: fecha, sorter: (a, b) => a.fecha.localeCompare(b.fecha) },
          { title: 'Estado', dataIndex: 'estado', render: (v: Suscriptor['estado']) => <Tag color={estados[v].color}>{estados[v].texto}</Tag> }
        ]} />
      <Typography.Text type="secondary">Consulta de la lista. El estado de las inscripciones corresponde a la última sincronización.</Typography.Text>
    </>}
  </Space>
}
