import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export interface GoatCounterConfig {
  /** El código del sitio: <site>.goatcounter.com */
  site: string
  /** Token de API con permiso de lectura de estadísticas. */
  token: string
}

export interface AppConfig {
  repoPath: string
  falApiKey: string
  /** Opcional: sin esto la pestaña de Visitas explica cómo configurarla. */
  goatcounter?: GoatCounterConfig
}

export function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export async function cargarConfig(): Promise<AppConfig | null> {
  try {
    const raw = await readFile(getConfigPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed.repoPath || !parsed.falApiKey) return null
    // goatcounter es opcional: el app funcionaba antes de que existiera.
    return parsed as AppConfig
  } catch {
    return null
  }
}
