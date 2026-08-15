import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const QUEUE_BASE = 'https://queue.fal.run'
const MODEL = 'fal-ai/flux/dev'

interface EstadoJob {
  status: string
}

interface ResultadoJob {
  images?: Array<{ url: string }>
}

export async function generarImagen(prompt: string, falApiKey: string, destPath: string): Promise<void> {
  const headers = {
    Authorization: `Key ${falApiKey}`,
    'Content-Type': 'application/json'
  }

  const submitRes = await fetch(`${QUEUE_BASE}/${MODEL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      image_size: 'landscape_16_9',
      num_images: 1,
      output_format: 'jpeg'
    })
  })
  if (!submitRes.ok) {
    throw new Error(`fal.ai rechazó la solicitud (${submitRes.status}): ${await submitRes.text()}`)
  }
  const { status_url: statusUrl, response_url: responseUrl } = await submitRes.json()
  if (!statusUrl || !responseUrl) {
    throw new Error('fal.ai no devolvió status_url/response_url.')
  }

  const resultado = await esperarResultado(statusUrl, responseUrl, headers)
  const [imagen] = resultado.images ?? []
  if (!imagen?.url) {
    throw new Error('fal.ai no devolvió ninguna imagen.')
  }

  const imgRes = await fetch(imagen.url)
  if (!imgRes.ok) throw new Error(`No se pudo descargar la imagen generada (${imgRes.status}).`)
  const buffer = Buffer.from(await imgRes.arrayBuffer())

  await mkdir(path.dirname(destPath), { recursive: true })
  await writeFile(destPath, buffer)
}

async function esperarResultado(
  statusUrl: string,
  responseUrl: string,
  headers: Record<string, string>,
  pollMs = 1500,
  maxWaitMs = 120_000
): Promise<ResultadoJob> {
  const inicio = Date.now()
  while (true) {
    const statusRes = await fetch(statusUrl, { headers })
    const status = (await statusRes.json()) as EstadoJob

    if (status.status === 'COMPLETED') {
      const res = await fetch(responseUrl, { headers })
      return (await res.json()) as ResultadoJob
    }
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new Error(`La generación de imagen falló: ${JSON.stringify(status)}`)
    }
    if (Date.now() - inicio > maxWaitMs) {
      throw new Error('Tiempo de espera agotado generando la imagen.')
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
}
