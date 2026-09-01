import { useEffect, useState } from 'react'
import { Button, Input, List, message, Progress, Result, Space, Spin, Table, Tag, Typography, Upload } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExportOutlined,
  FileTextOutlined,
  InboxOutlined,
  SyncOutlined
} from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'
import type { ColumnsType } from 'antd/es/table'

const { Dragger } = Upload
const { Paragraph, Text } = Typography

const MAX_ARCHIVOS_LOTE = 10

type ArquivoSelecionado = {
  filePath: string
  nomeArquivo: string
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

// Un paso intermedio entre soltar el documento y publicar: elegir el tema.
// Chips con las categorías que ya existen en el sitio (para reutilizarlas) o
// un campo libre para estrenar una nueva.
function ElegirCategoria({
  archivos,
  categorias,
  onPublicar,
  onCancelar
}: {
  archivos: ArquivoSelecionado[]
  categorias: string[]
  onPublicar: (categoria: string) => void
  onCancelar: () => void
}): JSX.Element {
  const [elegida, setElegida] = useState('')
  const [nueva, setNueva] = useState('')

  const categoriaFinal = nueva.trim() || elegida

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', padding: '8px 0' }}>
      <div>
        <Paragraph style={{ marginBottom: 8, textAlign: 'center' }}>
          <FileTextOutlined />{' '}
          <Text strong>
            {archivos.length === 1 ? archivos[0].nomeArquivo : `${archivos.length} documentos selecionados`}
          </Text>
        </Paragraph>
        {archivos.length > 1 && (
          <List
            size="small"
            bordered
            dataSource={archivos}
            style={{ maxHeight: 180, overflowY: 'auto' }}
            renderItem={(arquivo) => <List.Item>{arquivo.nomeArquivo}</List.Item>}
          />
        )}
      </div>

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
          {archivos.length === 1 ? 'Publicar' : `Publicar ${archivos.length} reflexiones`}
          {categoriaFinal ? ` en «${categoriaFinal}»` : ''}
        </Button>
      </Space>
    </Space>
  )
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
        categoria
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
    <div style={{ maxWidth: estado.fase === 'procesando' ? 960 : 560, margin: '0 auto' }}>
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
          multiple
          accept=".docx,.pdf"
          showUploadList={false}
          beforeUpload={(file: RcFile, fileList: RcFile[]) => {
            if (file.uid === fileList[0]?.uid) void elegirCategoria(fileList)
            return false
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Arrastra aquí uno o varios documentos (Word o PDF)</p>
          <p className="ant-upload-hint">O haz clic para elegirlos · Máximo 10 documentos por vez</p>
        </Dragger>
      )}

      {estado.fase === 'elegir-categoria' && (
        <ElegirCategoria
          archivos={estado.archivos}
          categorias={estado.categorias}
          onPublicar={(categoria) => procesar(estado.archivos, categoria)}
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
                  description={resultado.status === 'erro' ? resultado.mensagem : 'Publicada'}
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
