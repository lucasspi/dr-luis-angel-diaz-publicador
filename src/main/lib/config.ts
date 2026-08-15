import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export interface AppConfig {
  repoPath: string
  falApiKey: string
}

export function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export async function cargarConfig(): Promise<AppConfig | null> {
  try {
    const raw = await readFile(getConfigPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed.repoPath || !parsed.falApiKey) return null
    return parsed as AppConfig
  } catch {
    return null
  }
}
