import { useEffect, useState } from 'react'
import { Alert, App, Modal, Space, Typography } from 'antd'
import type { Publicacion } from '../../../preload'
import { Portada } from './Portada'
import { fechaLegible } from '../lib/formato'

const { Paragraph, Text } = Typography

export interface Consecuencias {
  /** Otro post publica en la misma URL, así que el enlace sobrevive. */
  urlCompartidaCon: Publicacion | null
  /** La portada se queda porque estos otros posts también la usan. */
  portadaCompartida: boolean
  /** Es la última reflexión de su tema: la página del tema desaparece. */
  ultimaDelTema: boolean
}

/**
 * Borrar saca la reflexión del sitio de verdad: el deploy hace
 * `s3 sync --delete`, así que la página no queda huérfana, se borra.
 *
 * El diálogo dice las consecuencias que no se pueden adivinar mirando la
 * tabla: si la URL muere o la hereda un duplicado, si la portada se va o se
 * queda porque otro post la usa, y si el tema se queda sin página.
 */
export function DialogoBorrar({
  publicacion,
  consecuencias,
  onCerrar,
  onListo
}: {
  publicacion: Publicacion | null
  consecuencias: Consecuencias | null
  onCerrar: () => void
  onListo: () => Promise<void>
}): JSX.Element {
  const { notification } = App.useApp()
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
  }, [publicacion])

  async function borrar(): Promise<void> {
    if (!publicacion) return
    setBorrando(true)
    setError('')
    try {
      const r = await window.api.borrarPublicacion(publicacion.archivo, publicacion.titulo)
      await onListo()
      notification.success({
        message: 'Reflexión borrada',
        description: (
          <>
            {r.imagenBorrada
              ? 'Se fue con su portada. '
              : r.imagenCompartidaCon.length > 0
                ? 'La portada se quedó, porque otra reflexión la usa. '
                : ''}
            El sitio tarda <b>1–2 minutos</b> en reconstruirse. Queda en el historial de
            Git, así que se puede recuperar.
          </>
        ),
        duration: 12,
        placement: 'bottomRight'
      })
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBorrando(false)
    }
  }

  return (
    <Modal
      open={publicacion !== null}
      title="¿Borrar esta reflexión?"
      okText="Sí, borrar del sitio"
      cancelText="Cancelar"
      okButtonProps={{ danger: true, loading: borrando }}
      cancelButtonProps={{ disabled: borrando }}
      onCancel={onCerrar}
      onOk={borrar}
      destroyOnClose
    >
      {publicacion && (
        <Space direction="vertical" size="middle" style={{ width: '100%', paddingTop: 8 }}>
          <Space align="start">
            <Portada src={publicacion.thumbUrl} alt={publicacion.titulo} />
            <div>
              <Text strong>{publicacion.titulo}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>
                {fechaLegible(publicacion.fecha)}
                {publicacion.categoria ? ` · ${publicacion.categoria}` : ''}
              </Text>
            </div>
          </Space>

          {consecuencias?.urlCompartidaCon ? (
            <Alert
              type="info"
              showIcon
              message="El enlace seguirá funcionando"
              description={
                <>
                  Hay otra reflexión con el mismo título y la misma dirección (
                  {fechaLegible(consecuencias.urlCompartidaCon.fecha)}), así que{' '}
                  <Text code style={{ fontSize: 12 }}>
                    /{publicacion.slug}
                  </Text>{' '}
                  se queda apuntando a esa.
                </>
              }
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="El enlace dejará de funcionar"
              description={
                <>
                  <Text code style={{ fontSize: 12 }}>
                    drluisangeldiaz.com/{publicacion.slug}
                  </Text>{' '}
                  dará error para quien lo tenga guardado o lo haya compartido.
                </>
              }
            />
          )}

          {consecuencias?.ultimaDelTema && (
            <Alert
              type="warning"
              showIcon
              message={`Es la última reflexión de «${publicacion.categoria}»`}
              description="La página de ese tema desaparecerá del sitio. El tema se queda en la lista de Temas, con cero reflexiones, por si quieres volver a usarlo."
            />
          )}

          {consecuencias?.portadaCompartida && (
            <Alert
              type="info"
              showIcon
              message="La portada se queda"
              description="Otra reflexión usa la misma imagen, así que no se borra."
            />
          )}

          <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
            Se publica solo y tarda 1–2 minutos en verse. Queda en el historial de Git, así
            que se puede recuperar.
          </Paragraph>

          {error && <Alert type="error" showIcon message={error} />}
        </Space>
      )}
    </Modal>
  )
}
