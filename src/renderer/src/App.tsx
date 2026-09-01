import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ConfigProvider, Tabs, Typography } from 'antd'
import { CloudUploadOutlined, UnorderedListOutlined } from '@ant-design/icons'
import esES from 'antd/locale/es_ES'
import { BarraActualizacion, type EstadoUpdate } from './components/BarraActualizacion'
import Publicador from './pages/Publicador'
import Publicaciones from './pages/Publicaciones'

const { Text } = Typography

// La ventana no tiene barra de título (titleBarStyle: 'hiddenInset'), así que
// la franja de arriba la dibuja la app y hay que declararla arrastrable a mano.
// Todo lo clicable que viva dentro tiene que volver a 'no-drag'.
const ARRASTRABLE = { WebkitAppRegion: 'drag' } as React.CSSProperties
const NO_ARRASTRABLE = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

// Hueco a la izquierda para los tres semáforos de macOS.
const HUECO_SEMAFOROS = 82

// HashRouter y no BrowserRouter: en la app empaquetada el renderer se carga
// por file://, donde las rutas con path real no resuelven.
const PAGINAS = [
  { ruta: '/publicar', etiqueta: 'Publicar', icono: <CloudUploadOutlined /> },
  { ruta: '/publicaciones', etiqueta: 'Publicaciones', icono: <UnorderedListOutlined /> }
]

function Cascara(): JSX.Element {
  const [estadoUpdate, setEstadoUpdate] = useState<EstadoUpdate>({ fase: 'inactivo' })
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => window.api.onEstadoActualizacion(setEstadoUpdate), [])

  const activa = PAGINAS.find((p) => pathname.startsWith(p.ruta))?.ruta ?? PAGINAS[0].ruta

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <header
        style={{
          ...ARRASTRABLE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          height: 52,
          flexShrink: 0,
          paddingLeft: HUECO_SEMAFOROS,
          paddingRight: 20,
          borderBottom: '1px solid #f0f0f0'
        }}
      >
        <Text strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>
          Publicador de reflexiones
        </Text>
        <div style={{ ...NO_ARRASTRABLE, minWidth: 0, textAlign: 'right' }}>
          <BarraActualizacion estado={estadoUpdate} />
        </div>
      </header>

      <div style={{ flexShrink: 0, padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
        <Tabs
          activeKey={activa}
          onChange={(ruta) => navigate(ruta)}
          tabBarStyle={{ margin: 0 }}
          items={PAGINAS.map((p) => ({
            key: p.ruta,
            label: (
              <span>
                {p.icono} {p.etiqueta}
              </span>
            )
          }))}
        />
      </div>

      <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <Routes>
          <Route path="/publicar" element={<Publicador />} />
          <Route path="/publicaciones" element={<Publicaciones />} />
          <Route path="*" element={<Navigate to="/publicar" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <ConfigProvider locale={esES}>
      <HashRouter>
        <Cascara />
      </HashRouter>
    </ConfigProvider>
  )
}
