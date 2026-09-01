import type { GoatCounterConfig } from './config'

export interface VisitasPorRuta {
  /** Ruta tal cual la cuenta GoatCounter: "/celebrar". */
  ruta: string
  visitas: number
}

export interface Visitas {
  desde: string
  hasta: string
  /** Páginas vistas en todo el sitio durante el periodo. */
  total: number
  porRuta: VisitasPorRuta[]
}

// GoatCounter devuelve como mucho 100 rutas por llamada y no expone un offset,
// así que para tener el número de las 184 reflexiones hay que pedirlas por
// nombre en tandas. La lista va separada por comas — repetir el parámetro
// solo respeta uno, cosa que no dice la documentación.
//
// 100 y no menos para gastar el mínimo de llamadas: la API deja pasar 4 por
// segundo, y con tandas de 60 salían 4 peticiones de golpe que, sumadas al
// doble montaje de React en desarrollo, devolvían 429.
const POR_TANDA = 100

// El límite es de 4 por segundo (cabecera x-rate-limit-limit). Se espacian a
// 350 ms en vez de apurarlo: aquí no corre prisa y así queda margen para que
// otra pantalla pida algo a la vez.
const MS_ENTRE_LLAMADAS = 350
let ultimaLlamada = 0

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function turno(): Promise<void> {
  const desde = Date.now() - ultimaLlamada
  if (desde < MS_ENTRE_LLAMADAS) await esperar(MS_ENTRE_LLAMADAS - desde)
  ultimaLlamada = Date.now()
}

async function pedir(
  cfg: GoatCounterConfig,
  ruta: string,
  params: Record<string, string>,
  intento = 1
): Promise<unknown> {
  const url = new URL(`https://${cfg.site}.goatcounter.com/api/v0${ruta}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  await turno()
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }
  })

  // 429: la propia respuesta dice cuántos segundos falta para poder seguir.
  if (res.status === 429 && intento <= 3) {
    const espera = Number(res.headers.get('x-rate-limit-reset') ?? 1)
    await esperar((Number.isFinite(espera) ? Math.max(espera, 1) : 1) * 1000)
    return pedir(cfg, ruta, params, intento + 1)
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'GoatCounter rechazó el token. Revisa que siga vigente y que tenga permiso de leer estadísticas.'
      )
    }
    if (res.status === 429) {
      throw new Error(
        'GoatCounter está limitando las peticiones. Espera unos segundos y pulsa Actualizar.'
      )
    }
    throw new Error(`GoatCounter respondió ${res.status} en ${ruta}.`)
  }
  // Cuando algo no le cuadra devuelve una página de error en HTML, no JSON.
  const texto = await res.text()
  try {
    return JSON.parse(texto)
  } catch {
    throw new Error(`GoatCounter devolvió algo que no es JSON en ${ruta}.`)
  }
}

function aHora(d: Date): string {
  const iso = new Date(d)
  iso.setUTCMinutes(0, 0, 0)
  return iso.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Visitas del sitio en un periodo, y cuántas se lleva cada ruta pedida.
 *
 * `start` sin `end` hace que la API conteste un error en HTML, así que las dos
 * fechas van siempre juntas.
 */
export async function leerVisitas(
  cfg: GoatCounterConfig,
  dias: number,
  rutas: string[]
): Promise<Visitas> {
  const hasta = new Date()
  const desde = new Date(hasta.getTime() - dias * 24 * 60 * 60 * 1000)
  const rango = { start: aHora(desde), end: aHora(hasta) }

  const total = (await pedir(cfg, '/stats/total', rango)) as { total?: number }

  const porRuta: VisitasPorRuta[] = []
  for (let i = 0; i < rutas.length; i += POR_TANDA) {
    const tanda = rutas.slice(i, i + POR_TANDA)
    const r = (await pedir(cfg, '/stats/hits', {
      ...rango,
      limit: '100',
      path_by_name: 'true',
      include_paths: tanda.join(',')
    })) as { hits?: { path?: string; count?: number }[] }

    // Una ruta sin visitas no vuelve en la respuesta; el que llama rellena con 0.
    for (const h of r.hits ?? []) {
      if (h.path) porRuta.push({ ruta: h.path, visitas: h.count ?? 0 })
    }
  }

  return {
    desde: rango.start,
    hasta: rango.end,
    total: total.total ?? 0,
    porRuta
  }
}
