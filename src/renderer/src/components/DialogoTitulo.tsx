import { useEffect, useState } from 'react'
import { Alert, App, Input, Modal, Space, Typography } from 'antd'
import type { Publicacion } from '../../../preload'
import { Portada } from './Portada'
import { fechaLegible } from '../lib/formato'

const { Paragraph, Text } = Typography

/**
 * Cambiar el título toca una línea del .md y nada más. Ni el archivo se
 * renombra ni el slug del catálogo se mueve, así que la dirección sigue siendo
 * la misma — la misma decisión que con el nombre de un tema.
 */
export function DialogoTitulo({
  publicacion,
  onCerrar,
  onListo
}: {
  publicacion: Publicacion | null
  onCerrar: () => void
  onListo: () => Promise<void>
}): JSX.Element {
  const { notification } = App.useApp()
  const [titulo, setTitulo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTitulo(publicacion?.titulo ?? '')
    setError('')
  }, [publicacion])

  const limpio = titulo.trim()
  const cambió = publicacion !== null && limpio !== '' && limpio !== publicacion.titulo

  async function guardar(): Promise<void> {
    if (!publicacion || !cambió) return
    setGuardando(true)
    setError('')
    try {
      await window.api.cambiarTitulo(publicacion.archivo, limpio)
      await onListo()
      notification.success({
        message: 'Título cambiado y publicado',
        description: (
          <>
            El sitio tarda <b>1–2 minutos</b> en reconstruirse. La dirección no cambia:{' '}
            <Text code style={{ fontSize: 12 }}>
              /{publicacion.slug}
            </Text>
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
      open={publicacion !== null}
      title="Cambiar el título"
      okText="Guardar y publicar"
      cancelText="Cancelar"
      onCancel={onCerrar}
      onOk={guardar}
      okButtonProps={{ disabled: !cambió, loading: guardando }}
      cancelButtonProps={{ disabled: guardando }}
      destroyOnClose
    >
      {publicacion && (
        <Space direction="vertical" size="middle" style={{ width: '100%', paddingTop: 8 }}>
          <Space align="start">
            <Portada src={publicacion.thumbUrl} alt={publicacion.titulo} />
            <Text type="secondary" style={{ fontSize: 13 }}>
              {fechaLegible(publicacion.fecha)}
              {publicacion.categoria ? ` · ${publicacion.categoria}` : ''}
            </Text>
          </Space>

          <Input.TextArea
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onPressEnter={(e) => {
              e.preventDefault()
              guardar()
            }}
            autoSize={{ minRows: 1, maxRows: 3 }}
            placeholder="Título de la reflexión"
            autoFocus
            disabled={guardando}
          />

          <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
            La dirección <b>no</b> se mueve — sigue siendo{' '}
            <Text code style={{ fontSize: 12 }}>
              /{publicacion.slug}
            </Text>
            , así que quien tenga el enlace guardado lo conserva. Se publica solo y tarda
            1–2 minutos en verse.
          </Paragraph>

          {error && <Alert type="error" showIcon message={error} />}
        </Space>
      )}
    </Modal>
  )
}
