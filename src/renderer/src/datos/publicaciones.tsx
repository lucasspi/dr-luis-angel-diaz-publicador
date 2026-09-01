import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Publicacion, Tema } from '../../../preload'

// Colores de los chips de tema. Arbitrarios y sin guardar en ningún lado: se
// reparten por posición en la lista ordenada de temas, no por hash del nombre.
// Con 13 temas y 11 colores algún hash siempre choca, y hacía que las tres
// "Capacitación…" salieran del mismo color, que es justo lo que se nota. Por
// posición se usan los 11 y las dos repeticiones quedan lejísimos en el abecé.
// El precio: si nace un tema nuevo, los de después cambian de color. Barato.
const PALETA = [
  'blue',
  'green',
  'purple',
  'orange',
  'cyan',
  'magenta',
  'geekblue',
  'lime',
  'volcano',
  'gold',
  'red'
]

interface Datos {
  publicaciones: Publicacion[] | null
  /** El registro de content/temas.json — la identidad de cada tema. */
  temas: Tema[]
  error: string
  avisoSync: string
  sincronizando: boolean
  /** Los temas usados por alguna reflexión publicada, en orden alfabético. */
  categorias: string[]
  colorTema: (categoria: string) => string | undefined
  recargar: (sincronizarAntes: boolean) => Promise<void>
  descartarAviso: () => void
}

const Contexto = createContext<Datos | null>(null)

/**
 * Una sola lectura del clone para toda la app. Las pantallas de Publicaciones
 * y Temas miran los mismos datos: si cada una hiciera su propio IPC, un
 * "Sincronizar" en una dejaría a la otra mostrando la foto vieja, y los
 * colores de los temas podrían no coincidir entre las dos tablas.
 */
export function ProveedorPublicaciones({ children }: { children: ReactNode }): JSX.Element {
  const [publicaciones, setPublicaciones] = useState<Publicacion[] | null>(null)
  const [temas, setTemas] = useState<Tema[]>([])
  const [error, setError] = useState('')
  const [avisoSync, setAvisoSync] = useState('')
  const [sincronizando, setSincronizando] = useState(false)

  const recargar = useCallback(async (sincronizarAntes: boolean): Promise<void> => {
    if (sincronizarAntes) setSincronizando(true)
    try {
      const resultado = await window.api.listarPublicaciones(sincronizarAntes)
      setPublicaciones(resultado.publicaciones)
      setAvisoSync(resultado.avisoSync)
      // El registro se relee junto con los posts: después de un renombrado o
      // de un pull, las dos cosas tienen que moverse a la vez.
      setTemas(await window.api.listarTemas())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSincronizando(false)
    }
  }, [])

  useEffect(() => {
    recargar(false)
  }, [recargar])

  // Los nombres para el filtro salen de lo que las reflexiones usan de verdad,
  // no del registro: filtrar por un tema sin reflexiones no dejaría nada.
  const categorias = useMemo(() => {
    const vistas = new Set((publicaciones ?? []).map((p) => p.categoria).filter(Boolean))
    return [...vistas].sort((a, b) => a.localeCompare(b, 'es'))
  }, [publicaciones])

  const colores = useMemo(
    () => new Map(categorias.map((c, i) => [c, PALETA[i % PALETA.length]])),
    [categorias]
  )

  const valor = useMemo<Datos>(
    () => ({
      publicaciones,
      temas,
      error,
      avisoSync,
      sincronizando,
      categorias,
      colorTema: (categoria: string) => colores.get(categoria),
      recargar,
      descartarAviso: () => setAvisoSync('')
    }),
    [publicaciones, temas, error, avisoSync, sincronizando, categorias, colores, recargar]
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function usePublicaciones(): Datos {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('usePublicaciones fuera de <ProveedorPublicaciones>')
  return valor
}
