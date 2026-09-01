import { Alert, Button, Space, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { usePublicaciones } from '../datos/publicaciones'

const { Text, Title } = Typography

/**
 * La franja que comparten las dos tablas: cuántas filas se están viendo,
 * el botón que trae lo último del sitio y el aviso de que el pull falló.
 *
 * El contador dice solo lo que la tabla muestra — con filtros puestos, el
 * total del sitio obliga a hacer la resta mentalmente y no aporta nada.
 */
export function CabeceraLista({ recuento }: { recuento: string }): JSX.Element {
  const { avisoSync, descartarAviso, sincronizando, recargar } = usePublicaciones()

  return (
    <>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="baseline" wrap>
        <Title level={5} style={{ margin: 0 }}>
          {recuento}
        </Title>
        <Button
          icon={<ReloadOutlined />}
          loading={sincronizando}
          onClick={() => recargar(true)}
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
          onClose={descartarAviso}
        />
      )}
    </>
  )
}
