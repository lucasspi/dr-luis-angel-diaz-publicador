import type { ReactNode } from 'react'
import { Space, Typography } from 'antd'

const { Paragraph, Title } = Typography

/**
 * El encabezado que comparten todas las pestañas: título grande, una línea
 * que dice para qué sirve la pantalla y, a la derecha, las acciones de la
 * pantalla (sincronizar, actualizar, período…). Mismo aire en todas.
 */
export function Encabezado({ titulo, descripcion, acciones }: { titulo: string; descripcion?: ReactNode; acciones?: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <Title level={2} style={{ marginTop: 0, marginBottom: descripcion ? 4 : 0 }}>{titulo}</Title>
        {descripcion && <Paragraph type="secondary" style={{ marginBottom: 0 }}>{descripcion}</Paragraph>}
      </div>
      {acciones && <Space align="center" style={{ paddingTop: 6 }}>{acciones}</Space>}
    </div>
  )
}
