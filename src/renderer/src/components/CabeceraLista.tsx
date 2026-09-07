import { Alert, Button, Typography } from 'antd'
import type { ReactNode } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { usePublicaciones } from '../datos/publicaciones'
import { Encabezado } from './Encabezado'

const { Text } = Typography

/**
 * La franja que comparten las dos tablas: cuántas filas se están viendo,
 * el botón que trae lo último del sitio y el aviso de que el pull falló.
 *
 * El contador dice solo lo que la tabla muestra — con filtros puestos, el
 * total del sitio obliga a hacer la resta mentalmente y no aporta nada.
 */
export function CabeceraLista({ titulo, descripcion, recuento }: { titulo: string; descripcion?: ReactNode; recuento: string }): JSX.Element {
  const { avisoSync, descartarAviso, sincronizando, recargar } = usePublicaciones()

  return (
    <>
      <Encabezado
        titulo={titulo}
        descripcion={descripcion}
        acciones={
          <>
            <Text type="secondary">{recuento}</Text>
            <Button icon={<ReloadOutlined />} loading={sincronizando} onClick={() => recargar(true)}>
              Sincronizar
            </Button>
          </>
        }
      />

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
          onClose={descartarAviso}
        />
      )}
    </>
  )
}
