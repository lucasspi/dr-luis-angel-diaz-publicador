import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface ReflexionFormateada {
  titulo: string
  versiculo: string
  resumen: string
  slug: string
  cuerpo_markdown: string
  image_prompt: string
}

const CAMPOS_REQUERIDOS = ['titulo', 'resumen', 'slug', 'cuerpo_markdown', 'image_prompt'] as const

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string' },
    versiculo: { type: 'string' },
    resumen: { type: 'string' },
    slug: { type: 'string' },
    cuerpo_markdown: { type: 'string' },
    image_prompt: { type: 'string' }
  },
  required: ['titulo', 'versiculo', 'resumen', 'slug', 'cuerpo_markdown', 'image_prompt'],
  additionalProperties: false
}

const PROMPT = `Eres el asistente editorial del sitio de reflexiones del Dr. Luis Ángel Díaz.
Lee el archivo input.txt en este mismo directorio: es el texto en bruto de una reflexión que el Dr. Luis Ángel Díaz escribió (puede venir de un Word o PDF, con saltos de línea o formato irregular).

Tu tarea:
1. Reescribe el texto como una reflexión pulida en español, en Markdown (##, negritas, citas > donde tenga sentido). NO inventes hechos, versículos ni citas que no estén en el texto original — solo mejora redacción, ortografía y estructura.
2. Elige "versiculo" (la referencia bíblica principal, si el texto la menciona; si no hay ninguna referencia clara, usa un string vacío "").
3. Escribe un "resumen": una frase corta (menos de 160 caracteres) que resuma la reflexión.
4. Escribe un "titulo": corto, fiel al contenido, sin inventar promesas que el texto no hace.
5. Genera un "slug": el título en minúsculas, sin tildes ni caracteres especiales, con guiones en vez de espacios (ej: "un-corazon-disponible").
6. Escribe un "image_prompt": descripción en inglés de una imagen 16:9 que acompañe la reflexión — tono de luz suave y esperanza, sin rostros reconocibles, sin texto en la imagen.

Escribe el resultado en output.json siguiendo exactamente el schema dado.`

export async function formatearConCodex(textoBruto: string): Promise<ReflexionFormateada> {
  const scratchDir = await mkdtemp(path.join(tmpdir(), 'dr-luis-publicador-'))
  try {
    await writeFile(path.join(scratchDir, 'input.txt'), textoBruto, 'utf-8')
    await writeFile(path.join(scratchDir, 'schema.json'), JSON.stringify(OUTPUT_SCHEMA, null, 2), 'utf-8')

    await runCodex(scratchDir)

    const raw = await readFile(path.join(scratchDir, 'output.json'), 'utf-8')
    const parsed = JSON.parse(raw) as ReflexionFormateada

    for (const campo of CAMPOS_REQUERIDOS) {
      if (!parsed[campo]) {
        throw new Error(`Codex no completó el campo "${campo}". Intenta de nuevo.`)
      }
    }

    return parsed
  } finally {
    await rm(scratchDir, { recursive: true, force: true })
  }
}

function runCodex(cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      'codex',
      [
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
        '--cd',
        cwd,
        '--output-schema',
        'schema.json',
        '-o',
        'output.json',
        PROMPT
      ],
      { cwd }
    )

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      reject(new Error(`No se pudo ejecutar "codex". ¿Está instalado y en el PATH? (${err.message})`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const lower = stderr.toLowerCase()
      if (lower.includes('usage limit') || lower.includes('quota') || lower.includes('rate limit')) {
        reject(new Error('Se alcanzó el límite de uso de tu cuenta de ChatGPT. Intenta de nuevo más tarde.'))
        return
      }
      reject(new Error(`Codex falló (código ${code}): ${stderr.slice(-500)}`))
    })
  })
}
