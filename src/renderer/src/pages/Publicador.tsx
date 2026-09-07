import { useEffect, useState } from 'react'
import { Button, Checkbox, ConfigProvider, Input, Select, Switch, List, message, Progress, Result, Space, Spin, Table, Tag, Typography, Upload } from 'antd'
import { Encabezado } from '../components/Encabezado'
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  MailOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExportOutlined,
  FileTextOutlined,
  InboxOutlined,
  SyncOutlined
} from '@ant-design/icons'
import './Publicador.css'
import type { RcFile } from 'antd/es/upload'
import type { ColumnsType } from 'antd/es/table'

const { Dragger } = Upload
const { Paragraph, Text } = Typography

const MAX_ARCHIVOS_LOTE = 10

type ArquivoSelecionado = {
  filePath: string
  nomeArquivo: string
  comunicar?: boolean
}

type ResultadoArquivo = ArquivoSelecionado &
  (
    | { status: 'exito'; url: string }
    | { status: 'erro'; mensagem: string }
  )

type ProgresoArchivo = {
  mensaje: string
  porcentaje: number
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'sin-configurar'; configPath: string }
  | { fase: 'listo' }
  | { fase: 'elegir-categoria'; archivos: ArquivoSelecionado[]; categorias: string[] }
  | {
      fase: 'procesando'
      total: number
      archivos: ArquivoSelecionado[]
      progresos: Record<string, ProgresoArchivo>
      resultados: ResultadoArquivo[]
    }
  | { fase: 'concluido'; resultados: ResultadoArquivo[]; categoria: string }
  | { fase: 'error'; mensaje: string }

export function ElegirCategoria({ archivos, categorias, onPublicar, onCancelar }: {
  archivos: ArquivoSelecionado[]
  categorias: string[]
  onPublicar: (categoria: string, avisos: string[]) => void
  onCancelar: () => void
}): JSX.Element {
  const [elegida, setElegida] = useState('')
  const [nueva, setNueva] = useState('')
  const [crearTema, setCrearTema] = useState(categorias.length === 0)
  const [avisos, setAvisos] = useState<string[]>([])
  const categoriaFinal = crearTema ? nueva.trim() : elegida
  const opciones = [...new Set(categorias)].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  const normalizar = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
  return <ConfigProvider theme={{ token: { colorPrimary: '#1c6e58', borderRadius: 8 } }}>
    <div className="publicar-formulario">
      <section className="publicar-panel">
        <div className="publicar-paso"><span>1</span><div><Typography.Title level={4}>Documentos seleccionados</Typography.Title><Text type="secondary">{archivos.length} {archivos.length === 1 ? 'reflexión lista' : 'reflexiones listas'} para publicar</Text></div><Tag>WORD / PDF</Tag></div>
        <div className="publicar-archivos">
          {archivos.map(archivo => <div className="publicar-archivo" key={archivo.filePath}>
            <FileTextOutlined className="publicar-archivo-icono" />
            <div className="publicar-archivo-nombre"><Text strong title={archivo.nomeArquivo}>{archivo.nomeArquivo}</Text><Text type="secondary">{avisos.includes(archivo.filePath) ? 'Sitio web + aviso por correo' : 'Solo en el sitio web'}</Text></div>
            <label className="publicar-correo-control">
              <span>Avisar por correo</span>
              <Switch checkedChildren="Sí" unCheckedChildren="No" checked={avisos.includes(archivo.filePath)} aria-label={`Avisar por correo: ${archivo.nomeArquivo}`} onChange={checked => setAvisos(prev => checked ? [...prev, archivo.filePath] : prev.filter(p => p !== archivo.filePath))} />
            </label>
          </div>)}
        </div>
        <div className="publicar-aviso">
          <MailOutlined /><div><Text strong>Avisar a los suscriptores</Text><Paragraph type="secondary">Elige «Sí» en «Avisar por correo» para las reflexiones que quieras comunicar. Las seleccionadas se reunirán en un único correo por suscriptor, con un enlace a cada reflexión. Las demás se publicarán únicamente en el sitio.</Paragraph>
          {archivos.length > 1 && <Checkbox checked={avisos.length === archivos.length} indeterminate={avisos.length > 0 && avisos.length < archivos.length} onChange={e => setAvisos(e.target.checked ? archivos.map(a => a.filePath) : [])}>Avisar sobre todas las reflexiones</Checkbox>}</div>
        </div>
      </section>
      <section className="publicar-panel">
        <div className="publicar-paso"><span>2</span><div><Typography.Title level={4}>Elige el tema</Typography.Title><Text type="secondary">{archivos.length > 1 ? 'Se aplicará a todos los documentos de este lote.' : 'Ayuda a tus lectores a encontrar esta reflexión.'}</Text></div></div>
        <label className="publicar-etiqueta" htmlFor={crearTema ? 'nuevo-tema' : 'tema-reflexion'}>{crearTema ? 'Nombre del nuevo tema' : 'Tema de la reflexión'}</label>
        {crearTema ? <Input id="nuevo-tema" size="large" value={nueva} onChange={e => setNueva(e.target.value)} placeholder="Ej.: Familia, Oración, Vida cristiana…" maxLength={160} /> :
          <Select id="tema-reflexion" aria-label="Tema de la reflexión" size="large" showSearch placeholder="Busca y selecciona un tema" value={elegida || undefined} onChange={setElegida} style={{ width: '100%' }}
            options={opciones.map(c => ({ value: c, label: c }))} filterOption={(input, option) => normalizar(String(option?.label || '')).includes(normalizar(input))} />}
        <Button type="link" style={{ paddingLeft: 0, marginTop: 6 }} onClick={() => setCrearTema(v => !v)} disabled={crearTema && categorias.length === 0}>{crearTema ? 'Elegir un tema existente' : '+ Crear un tema nuevo'}</Button>
      </section>
      <div className="publicar-resumen">
        <div><Text strong>{archivos.length} {archivos.length === 1 ? 'reflexión' : 'reflexiones'} en el sitio</Text><br /><Text type="secondary">{avisos.length ? `${avisos.length} ${avisos.length === 1 ? 'seleccionada' : 'seleccionadas'} para avisar por correo` : 'Sin avisos por correo'}</Text></div>
        <Space><Button size="large" onClick={onCancelar}>Cancelar</Button><Button size="large" type="primary" icon={<CloudUploadOutlined />} disabled={!categoriaFinal} onClick={() => onPublicar(categoriaFinal, avisos)}>{archivos.length === 1 ? 'Publicar reflexión' : `Publicar ${archivos.length} reflexiones`}</Button></Space>
      </div>
      <Paragraph type="secondary" className="publicar-ayuda">Los avisos se procesan después de que las reflexiones estén disponibles en el sitio, cuando el servicio de correo esté activado.</Paragraph>
    </div>
  </ConfigProvider>
}

type LinhaProcessamento = ArquivoSelecionado & {
  estado: 'exito' | 'erro' | 'procesando' | 'pendiente'
  progresso: number
  detalhe: string
  url?: string
}

function TabelaProcessamento({
  estado
}: {
  estado: Extract<Estado, { fase: 'procesando' }>
}): JSX.Element {
  const linhas: LinhaProcessamento[] = estado.archivos.map((arquivo) => {
    const resultado = estado.resultados.find((item) => item.filePath === arquivo.filePath)
    const progresso = estado.progresos[arquivo.filePath]
    if (resultado?.status === 'exito') {
      return { ...arquivo, estado: 'exito', progresso: 100, detalhe: 'Publicada', url: resultado.url }
    }
    if (resultado?.status === 'erro') {
      return {
        ...arquivo,
        estado: 'erro',
        progresso: progresso?.porcentaje ?? 100,
        detalhe: resultado.mensagem
      }
    }
    if (progresso) {
      return {
        ...arquivo,
        estado: 'procesando',
        progresso: progresso.porcentaje,
        detalhe: progresso.mensaje
      }
    }
    return { ...arquivo, estado: 'pendiente', progresso: 0, detalhe: 'En espera' }
  })

  const progressoGeral = Math.round(
    linhas.reduce(
      (suma, linha) => suma + (linha.estado === 'exito' || linha.estado === 'erro' ? 100 : linha.progresso),
      0
    ) / estado.total
  )
  const enProceso = linhas.filter((linha) => linha.estado === 'procesando').length

  const columnas: ColumnsType<LinhaProcessamento> = [
    {
      title: 'Documento',
      dataIndex: 'nomeArquivo',
      key: 'documento',
      ellipsis: true,
      render: (nomeArquivo: string) => (
        <Space size={8}>
          <FileTextOutlined style={{ color: '#8c8c8c' }} />
          <Text strong>{nomeArquivo}</Text>
        </Space>
      )
    },
    {
      title: 'Estado',
      dataIndex: 'estado',
      key: 'estado',
      width: 145,
      render: (valor: LinhaProcessamento['estado']) => {
        if (valor === 'exito') {
          return <Tag icon={<CheckCircleOutlined />} color="success">Publicada</Tag>
        }
        if (valor === 'erro') {
          return <Tag icon={<CloseCircleOutlined />} color="error">Error</Tag>
        }
        if (valor === 'procesando') {
          return <Tag icon={<SyncOutlined spin />} color="processing">Procesando</Tag>
        }
        return <Tag icon={<ClockCircleOutlined />}>Pendiente</Tag>
      }
    },
    {
      title: 'Progreso',
      key: 'progreso',
      width: 285,
      render: (_valor, linha) => (
        <div>
          <Progress
            percent={linha.progresso}
            size="small"
            status={
              linha.estado === 'erro'
                ? 'exception'
                : linha.estado === 'exito'
                  ? 'success'
                  : linha.estado === 'procesando'
                    ? 'active'
                    : 'normal'
            }
          />
          <Text
            type={linha.estado === 'erro' ? 'danger' : 'secondary'}
            ellipsis={{ tooltip: linha.detalhe }}
            style={{ display: 'block', fontSize: 12 }}
          >
            {linha.detalhe}
          </Text>
        </div>
      )
    },
    {
      title: 'Link',
      key: 'link',
      width: 92,
      align: 'center',
      render: (_valor, linha) =>
        linha.url ? (
          <Button
            type="link"
            size="small"
            icon={<ExportOutlined />}
            onClick={() => window.api.abrirEnlace(linha.url!)}
          >
            Abrir
          </Button>
        ) : (
          <Text type="secondary">—</Text>
        )
    }
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', padding: '8px 0 24px' }}>
      <div>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Publicando {estado.total} reflexiones
            </Typography.Title>
            <Text type="secondary">
              {estado.resultados.length} completadas · {enProceso} en proceso
            </Text>
          </div>
          <Text strong>{progressoGeral}%</Text>
        </Space>
        <Progress percent={progressoGeral} showInfo={false} status="active" />
      </div>

      <Table
        rowKey="filePath"
        columns={columnas}
        dataSource={linhas}
        pagination={false}
        size="middle"
        tableLayout="fixed"
        scroll={{ y: 340 }}
      />

      <Paragraph type="secondary" style={{ textAlign: 'center', margin: 0 }}>
        Cada documento suele tardar 2–4 minutos. No cierres la aplicación.
      </Paragraph>
    </Space>
  )
}

export default function Publicador(): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    window.api.obtenerConfig().then(({ configurado, configPath }) => {
      setEstado(configurado ? { fase: 'listo' } : { fase: 'sin-configurar', configPath })
    })
  }, [])

  async function elegirCategoria(files: RcFile[]): Promise<void> {
    const archivos = Array.from(
      new Map(
        files.map((file) => {
          const filePath = window.api.getPathForFile(file)
          const nomeArquivo = filePath.split(/[/\\]/).pop() ?? file.name
          return [filePath, { filePath, nomeArquivo }]
        })
      ).values()
    )
    if (archivos.length === 0) return
    if (archivos.length > MAX_ARCHIVOS_LOTE) {
      message.warning(`Puedes publicar un máximo de ${MAX_ARCHIVOS_LOTE} documentos por vez.`)
      return
    }

    let categorias: string[] = []
    try {
      categorias = await window.api.listarCategorias()
    } catch {
      // sin lista no se bloquea nada — el campo libre alcanza
    }
    setEstado({ fase: 'elegir-categoria', archivos, categorias })
  }

  async function procesar(archivos: ArquivoSelecionado[], categoria: string): Promise<void> {
    setEstado({
      fase: 'procesando',
      total: archivos.length,
      archivos,
      progresos: {},
      resultados: []
    })

    const quitarListener = window.api.onProgresoLote((evento) => {
      setEstado((prev) => {
        if (prev.fase !== 'procesando') return prev
        if (evento.tipo === 'progreso') {
          return {
            ...prev,
            progresos: {
              ...prev.progresos,
              [evento.filePath]: { mensaje: evento.mensaje, porcentaje: evento.porcentaje }
            }
          }
        }

        const arquivo = archivos.find((item) => item.filePath === evento.filePath)
        if (!arquivo) return prev
        const resultado: ResultadoArquivo =
          evento.tipo === 'exito'
            ? { ...arquivo, status: 'exito', url: evento.url }
            : { ...arquivo, status: 'erro', mensagem: evento.mensaje }
        return {
          ...prev,
          resultados: [
            ...prev.resultados.filter((item) => item.filePath !== evento.filePath),
            resultado
          ]
        }
      })
    })

    try {
      const respuesta = await window.api.procesarDocumentos(
        archivos.map((arquivo) => arquivo.filePath),
        categoria,
        archivos.filter(a => a.comunicar === true).map(a => a.filePath)
      )
      const resultados: ResultadoArquivo[] = respuesta.map((resultado) => {
        const arquivo = archivos.find((item) => item.filePath === resultado.filePath)!
        return resultado.status === 'exito'
          ? { ...arquivo, status: 'exito', url: resultado.url }
          : { ...arquivo, status: 'erro', mensagem: resultado.mensaje }
      })
      setEstado({ fase: 'concluido', resultados, categoria })
    } catch (err) {
      setEstado({ fase: 'error', mensaje: err instanceof Error ? err.message : String(err) })
    } finally {
      quitarListener()
    }
  }

  const archivosFallidos =
    estado.fase === 'concluido'
      ? estado.resultados.filter(
          (resultado): resultado is ResultadoArquivo & { status: 'erro' } => resultado.status === 'erro'
        )
      : []

  return (
    <div style={{ maxWidth: estado.fase === 'procesando' ? 960 : 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Encabezado
          titulo="Publicar reflexión"
          descripcion="Comparte nuevas lecturas y elige cuáles anunciar a tus suscriptores."
        />
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
          style={{ background: '#f5f9f6', borderColor: '#b9d5c9', borderRadius: 16, padding: '32px 16px' }}
          multiple
          accept=".docx,.pdf"
          showUploadList={false}
          beforeUpload={(file: RcFile, fileList: RcFile[]) => {
            if (file.uid === fileList[0]?.uid) void elegirCategoria(fileList)
            return false
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: '#1c6e58' }} />
          </p>
          <p className="ant-upload-text">Arrastra aquí uno o varios documentos (Word o PDF)</p>
          <p className="ant-upload-hint">O haz clic para elegirlos · Máximo 10 documentos por vez</p>
        </Dragger>
      )}

      {estado.fase === 'elegir-categoria' && (
        <ElegirCategoria
          archivos={estado.archivos}
          categorias={estado.categorias}
          onPublicar={(categoria, avisos) => procesar(estado.archivos.map(a => ({ ...a, comunicar: avisos.includes(a.filePath) })), categoria)}
          onCancelar={() => setEstado({ fase: 'listo' })}
        />
      )}

      {estado.fase === 'procesando' && (
        <TabelaProcessamento estado={estado} />
      )}

      {estado.fase === 'concluido' && (
        <Result
          status={estado.resultados.some((resultado) => resultado.status === 'erro') ? 'warning' : 'success'}
          title={
            estado.resultados.length === 1
              ? estado.resultados[0].status === 'exito'
                ? '¡Reflexión publicada!'
                : 'No se pudo publicar la reflexión'
              : `${estado.resultados.filter((resultado) => resultado.status === 'exito').length} de ${estado.resultados.length} reflexiones publicadas`
          }
          subTitle="Las reflexiones publicadas pueden tardar 1–2 minutos en aparecer en el sitio."
          extra={[
            ...(archivosFallidos.length > 0
              ? [
                  <Button
                    key="reintentar-fallidas"
                    type="primary"
                    onClick={() => procesar(archivosFallidos, estado.categoria)}
                  >
                    Reintentar fallidas ({archivosFallidos.length})
                  </Button>
                ]
              : []),
            <Button key="publicar-mas" onClick={() => setEstado({ fase: 'listo' })}>
              Publicar más reflexiones
            </Button>
          ]}
        >
          <List
            bordered
            dataSource={estado.resultados}
            renderItem={(resultado) => (
              <List.Item
                actions={[
                  resultado.status === 'exito' ? (
                    <Button
                      key="ver"
                      type="link"
                      onClick={() => window.api.abrirEnlace(resultado.url)}
                    >
                      Ver
                    </Button>
                  ) : (
                    <Button
                      key="reintentar"
                      type="link"
                      onClick={() => procesar([resultado], estado.categoria)}
                    >
                      Reintentar
                    </Button>
                  )
                ]}
              >
                <List.Item.Meta
                  avatar={
                    resultado.status === 'exito' ? (
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                    )
                  }
                  title={resultado.nomeArquivo}
                  description={resultado.status === 'erro' ? resultado.mensagem : resultado.comunicar ? 'Publicada · Seleccionada para aviso por correo' : 'Publicada · Solo en el sitio web'}
                />
              </List.Item>
            )}
          />
        </Result>
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
  )
}
