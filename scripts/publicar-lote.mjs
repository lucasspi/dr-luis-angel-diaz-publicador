#!/usr/bin/env node
// publicar-lote.mjs — publica EN MASA documentos históricos del Dr. Luis.
//
// Es la versión por lotes del pipeline del app (src/main/lib/pipeline.ts):
// para cada documento (.docx / .pdf / .txt) extrae el texto, lo formatea con
// Codex, genera la imagen de portada (fal.ai) y escribe el .md en
// content/posts/ del clon del sitio — pero con la FECHA DE CREACIÓN del
// documento original (metadatos del .docx/.pdf), no la de hoy, y procesando
// varios documentos a la vez. Al final hace UN solo commit+push (= un solo
// deploy), y solo si se pide con --push.
//
// Guía paso a paso (léela antes de ejecutar): scripts/PUBLICAR-LOTE.md
// Mantener la lógica compartida en sincronía con src/main/lib/*.ts.
//
// Uso:
//   node scripts/publicar-lote.mjs --repo /ruta/al/clon/dr-luis-angel-diaz [opciones] doc1.docx doc2.pdf ...
//
// Ejecuta con --ayuda para ver todas las opciones.

import { execFile, spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import matter from 'gray-matter'
import mammoth from 'mammoth'
// Import directo de lib/: el index.js de pdf-parse ejecuta código de debug
// cuando se importa como ESM (module.parent undefined) y revienta.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

// ---------------------------------------------------------------------------
// Ayuda
// ---------------------------------------------------------------------------

const AYUDA = `
publicar-lote — publica en masa documentos históricos en drluisangeldiaz.com

USO
  node scripts/publicar-lote.mjs --repo <ruta> [opciones] <documentos...>

  <documentos...>  rutas a archivos .docx, .pdf o .txt (uno por reflexión)

OBLIGATORIO
  --repo <ruta>      clon local del repo del sitio (dr-luis-angel-diaz)

OPCIONES
  --solo-plan        NO publica nada: solo imprime qué haría (archivo → fecha
                     detectada → categoría). Ejecuta esto SIEMPRE primero y
                     revisa las fechas antes de la ejecución real.
  --manifest <ruta>  JSON con la lista de documentos y overrides por documento
                     (ver formato abajo). Se puede combinar con documentos
                     posicionales.
  --fal-key <clave>  clave de fal.ai para las imágenes de portada. También se
                     lee de la variable de entorno FAL_API_KEY o de --config.
  --config <ruta>    config.json con { "repoPath": ..., "falApiKey": ... }
                     (el mismo formato del config del app). --repo y --fal-key
                     explícitos tienen prioridad.
  --sin-imagen       no genera imágenes (el diseño del sitio funciona sin
                     imagen). Sin esta opción, hace falta la clave de fal.ai.
  --categoria <cat>  categoría fija para TODO el lote (ej: "Ministerio").
                     Sin ella, Codex elige entre las categorías que ya existen
                     en el sitio (o ninguna).
  --paralelo <n>     cuántos documentos procesar a la vez (default 3, máx 8).
  --modelo <m>       modelo para "codex exec -m <m>" (default: el de tu codex).
  --borrador         escribe los posts con publicado: false (no salen al sitio).
  --push             al terminar: build de verificación del sitio + UN commit
                     con todo el lote + push (el push dispara el deploy real).
                     Sin --push solo escribe los archivos en el clon.
  --ayuda, -h        esta ayuda.

FORMATO DEL MANIFEST (JSON, array de objetos)
  [
    { "archivo": "/ruta/Devocional 4.docx" },
    { "archivo": "/ruta/Devocional 5.docx", "fecha": "2026-03-02" },
    { "archivo": "/ruta/otro.pdf", "categoria": "Familia", "titulo": "Título exacto" }
  ]
  "fecha" (YYYY-MM-DD) manda sobre la fecha detectada. "titulo" manda sobre el
  título que escriba Codex (y define el slug). "categoria" manda sobre todo.

DE DÓNDE SALE LA FECHA (en este orden; se imprime la fuente elegida)
  1. "fecha" del manifest
  2. metadatos internos del .docx (dcterms:created) o del .pdf (CreationDate)
  3. fecha de creación del archivo en disco (birthtime) — ⚠ puede ser la fecha
     de una copia/descarga, no la real: verifícala en el --solo-plan
  Si ninguna fuente da una fecha válida (o da una futura), ese documento se
  reporta como error: corrige con "fecha" en el manifest. NUNCA se inventa.

SALIDA
  código 0 = todo publicado · 1 = algunos documentos fallaron (el resumen
  final dice cuáles y por qué; re-ejecuta SOLO esos) · 2 = error de
  requisitos, no se procesó nada.
`

// ---------------------------------------------------------------------------
// Prompt y schema para Codex (espejo de src/main/lib/codexFormat.ts, más la
// categoría — mantener en sincronía)
// ---------------------------------------------------------------------------

const PROMPT = `Eres el asistente editorial del sitio de reflexiones del Dr. Luis Ángel Díaz.
Lee el archivo input.txt en este mismo directorio: es el texto en bruto de una reflexión que el Dr. Luis Ángel Díaz escribió (puede venir de un Word o PDF, con saltos de línea o formato irregular).

Tu tarea:
1. Reescribe el texto como una reflexión pulida en español, en Markdown (##, negritas, citas > donde tenga sentido). NO inventes hechos, versículos ni citas que no estén en el texto original — solo mejora redacción, ortografía y estructura.
2. Elige "versiculo" (la referencia bíblica principal, si el texto la menciona; si no hay ninguna referencia clara, usa un string vacío "").
3. Escribe un "resumen": una frase corta (menos de 160 caracteres) que resuma la reflexión.
4. Escribe un "titulo": corto, fiel al contenido, sin inventar promesas que el texto no hace. El título va directo, SIN prefijos de numeración o de serie: si el documento original se titula "Devocional 12: La integridad del líder" (o "Reflexión N.º 3 —", etc.), el titulo es solo "La integridad del líder". Ese número de serie no debe aparecer en titulo, slug ni cuerpo_markdown.
5. Genera un "slug": el título en minúsculas, sin tildes ni caracteres especiales, con guiones en vez de espacios (ej: "un-corazon-disponible").
6. Escribe un "image_prompt": descripción en inglés de una imagen 16:9 que acompañe la reflexión — tono de luz suave y esperanza, sin rostros reconocibles, sin texto en la imagen.
7. Elige "categoria": el tema de la reflexión, EXACTAMENTE una de las opciones que permite el schema. Usa "" si ninguna encaja con claridad — no la fuerces.

Tu respuesta final (el último mensaje) debe ser únicamente el JSON con esos campos, siguiendo exactamente el schema dado. No crees ni escribas ningún archivo tú mismo: la respuesta se guarda sola en output.json.`

function outputSchema(categoriasPermitidas) {
  return {
    type: 'object',
    properties: {
      titulo: { type: 'string' },
      versiculo: { type: 'string' },
      resumen: { type: 'string' },
      slug: { type: 'string' },
      cuerpo_markdown: { type: 'string' },
      image_prompt: { type: 'string' },
      categoria: { type: 'string', enum: [...categoriasPermitidas, ''] }
    },
    required: ['titulo', 'versiculo', 'resumen', 'slug', 'cuerpo_markdown', 'image_prompt', 'categoria'],
    additionalProperties: false
  }
}

// Espejo de quitarPrefijoSerie / quitarPrefijoSerieDeSlug en codexFormat.ts.
const PREFIJO_SERIE = /^\s*(?:devocional(?:es)?|devoci[oó]n|reflexi[oó]n(?:es)?)\s*(?:n\.?\s*[ºo°]?\s*)?\d+\s*[:.\-–—]\s*/i
const PREFIJO_SERIE_SLUG = /^(?:devocionales?|devocion|reflexion(?:es)?)-(?:no?-)?\d+-/i

function quitarPrefijoSerie(titulo) {
  return titulo.replace(PREFIJO_SERIE, '').trim() || titulo.trim()
}

function sanitizarSlug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(PREFIJO_SERIE_SLUG, '')
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const EXTENSIONES = new Set(['.docx', '.pdf', '.txt'])

function fallar(mensaje) {
  console.error(`\n✗ ${mensaje}`)
  process.exit(2)
}

async function existe(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function fechaLocalISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function ejecutar(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => reject(new Error(`No se pudo ejecutar "${cmd}": ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} ${args.join(' ')} falló (código ${code}): ${(stderr || stdout).trim().slice(-800)}`))
    })
  })
}

// Pool simple: corre `fn(item)` para cada item con como máximo `limite` a la vez.
async function enParalelo(items, limite, fn) {
  const resultados = new Array(items.length)
  let indice = 0
  async function trabajador() {
    while (indice < items.length) {
      const i = indice++
      resultados[i] = await fn(items[i], i)
    }
  }
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, trabajador)
  await Promise.all(trabajadores)
  return resultados
}

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

const FLAGS_CON_VALOR = new Set(['--repo', '--manifest', '--fal-key', '--config', '--categoria', '--paralelo', '--modelo'])
const FLAGS_BOOLEANAS = new Set(['--solo-plan', '--sin-imagen', '--borrador', '--push', '--ayuda', '-h'])

function parseArgs(argv) {
  const opciones = { documentos: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (FLAGS_CON_VALOR.has(arg)) {
      const valor = argv[++i]
      if (valor === undefined) fallar(`La opción ${arg} necesita un valor.`)
      opciones[arg.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = valor
    } else if (FLAGS_BOOLEANAS.has(arg)) {
      opciones[arg.replace(/^--?/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true
    } else if (arg.startsWith('-')) {
      fallar(`Opción desconocida: ${arg}. Ejecuta con --ayuda para ver las opciones válidas.`)
    } else {
      opciones.documentos.push(arg)
    }
  }
  return opciones
}

// ---------------------------------------------------------------------------
// Fechas de creación
// ---------------------------------------------------------------------------

function fechaDeDocx(archivo) {
  // El .docx es un zip; la fecha real de creación vive en docProps/core.xml.
  return new Promise((resolve) => {
    execFile('unzip', ['-p', archivo, 'docProps/core.xml'], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null)
      const m = String(stdout).match(/<dcterms:created[^>]*>(\d{4})-(\d{2})-(\d{2})/)
      resolve(m ? `${m[1]}-${m[2]}-${m[3]}` : null)
    })
  })
}

function fechaDePdfInfo(info) {
  const bruto = String(info?.CreationDate || info?.ModDate || '')
  const m = bruto.match(/D:(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

const TIMEOUT_CODEX_MS = 10 * 60 * 1000

function runCodex(cwd, modelo) {
  return new Promise((resolve, reject) => {
    const args = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--cd', cwd, '--output-schema', 'schema.json', '-o', 'output.json']
    if (modelo) args.push('-m', modelo)
    args.push(PROMPT)

    // stdin cerrado: si queda abierto, codex se pone a "leer input adicional
    // de stdin" y nunca arranca.
    const child = spawn('codex', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()))

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Codex tardó más de ${TIMEOUT_CODEX_MS / 60000} minutos — abortado.`))
    }, TIMEOUT_CODEX_MS)

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`No se pudo ejecutar "codex". ¿Está instalado y en el PATH? (${err.message})`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      const bajo = stderr.toLowerCase()
      if (bajo.includes('usage limit') || bajo.includes('quota') || bajo.includes('rate limit')) {
        reject(new Error('Se alcanzó el límite de uso de la cuenta de ChatGPT. Espera y re-ejecuta solo los documentos que falten.'))
      } else {
        reject(new Error(`Codex falló (código ${code}): ${stderr.slice(-500)}`))
      }
    })
  })
}

async function formatearConCodex(textoBruto, categoriasPermitidas, modelo) {
  const scratchDir = await mkdtemp(path.join(tmpdir(), 'dr-luis-lote-'))
  try {
    await writeFile(path.join(scratchDir, 'input.txt'), textoBruto, 'utf-8')
    await writeFile(path.join(scratchDir, 'schema.json'), JSON.stringify(outputSchema(categoriasPermitidas), null, 2), 'utf-8')
    await runCodex(scratchDir, modelo)
    const parsed = JSON.parse(await readFile(path.join(scratchDir, 'output.json'), 'utf-8'))
    for (const campo of ['titulo', 'resumen', 'slug', 'cuerpo_markdown', 'image_prompt']) {
      if (!parsed[campo]) throw new Error(`Codex no completó el campo "${campo}".`)
    }
    if (parsed.cuerpo_markdown.length < 200) {
      throw new Error('La reflexión generada quedó demasiado corta — parece una respuesta incompleta de Codex. Re-ejecuta este documento.')
    }
    return parsed
  } finally {
    await rm(scratchDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Imagen (espejo de src/main/lib/imageGen.ts — mantener en sincronía)
// ---------------------------------------------------------------------------

const FAL_QUEUE = 'https://queue.fal.run'
const FAL_MODEL = 'fal-ai/flux/dev'

async function generarImagen(prompt, falApiKey, destPath) {
  const headers = { Authorization: `Key ${falApiKey}`, 'Content-Type': 'application/json' }
  const submitRes = await fetch(`${FAL_QUEUE}/${FAL_MODEL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_images: 1, output_format: 'jpeg' })
  })
  if (!submitRes.ok) throw new Error(`fal.ai rechazó la solicitud (${submitRes.status}): ${await submitRes.text()}`)
  const { status_url: statusUrl, response_url: responseUrl } = await submitRes.json()
  if (!statusUrl || !responseUrl) throw new Error('fal.ai no devolvió status_url/response_url.')

  const inicio = Date.now()
  while (true) {
    const status = await (await fetch(statusUrl, { headers })).json()
    if (status.status === 'COMPLETED') break
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new Error(`La generación de imagen falló: ${JSON.stringify(status)}`)
    }
    if (Date.now() - inicio > 120_000) throw new Error('Tiempo de espera agotado generando la imagen.')
    await new Promise((r) => setTimeout(r, 1500))
  }
  const resultado = await (await fetch(responseUrl, { headers })).json()
  const [imagen] = resultado.images ?? []
  if (!imagen?.url) throw new Error('fal.ai no devolvió ninguna imagen.')
  const imgRes = await fetch(imagen.url)
  if (!imgRes.ok) throw new Error(`No se pudo descargar la imagen generada (${imgRes.status}).`)
  await mkdir(path.dirname(destPath), { recursive: true })
  await writeFile(destPath, Buffer.from(await imgRes.arrayBuffer()))
}

// ---------------------------------------------------------------------------
// Estado del sitio: categorías y slugs existentes
// ---------------------------------------------------------------------------

async function leerPostsExistentes(repoPath) {
  const dir = path.join(repoPath, 'content', 'posts')
  const categorias = new Set()
  const slugs = new Set()
  if (!(await existe(dir))) fallar(`No existe ${dir} — ¿--repo apunta al clon correcto de dr-luis-angel-diaz?`)
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.md')) continue
    const parsed = matter(await readFile(path.join(dir, f), 'utf-8'))
    const cat = typeof parsed.data.categoria === 'string' ? parsed.data.categoria.trim() : ''
    if (cat) categorias.add(cat)
    const base = f.replace(/\.md$/, '')
    const m = base.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)
    slugs.add(parsed.data.slug || (m ? m[1] : base))
  }
  return { categorias: [...categorias].sort(), slugs }
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------

async function main() {
  const op = parseArgs(process.argv.slice(2))
  if (op.ayuda || op.h) {
    console.log(AYUDA)
    return
  }

  // --- Requisitos (todo se valida ANTES de gastar en Codex/fal.ai) ---------

  const major = Number(process.versions.node.split('.')[0])
  if (major < 18) fallar(`Se necesita Node 18 o superior (tienes ${process.versions.node}).`)

  let config = {}
  if (op.config) {
    if (!(await existe(op.config))) fallar(`No existe el archivo de config: ${op.config}`)
    config = JSON.parse(await readFile(op.config, 'utf-8'))
  }
  const repoPath = path.resolve(op.repo || config.repoPath || '')
  if (!op.repo && !config.repoPath) fallar('Falta --repo <ruta-al-clon-del-sitio> (o --config con "repoPath").')
  if (!(await existe(path.join(repoPath, '.git')))) fallar(`${repoPath} no es un repo git — clona primero dr-luis-angel-diaz.`)

  const falKey = op.falKey || process.env.FAL_API_KEY || config.falApiKey || ''
  if (!op.soloPlan && !op.sinImagen && !falKey) {
    fallar('Falta la clave de fal.ai para las imágenes: pásala con --fal-key, con la variable FAL_API_KEY o con --config. Si quieres publicar sin imágenes, usa --sin-imagen.')
  }

  const paralelo = Math.min(Math.max(parseInt(op.paralelo || '3', 10) || 3, 1), 8)

  // Lista de documentos: posicionales + manifest.
  const trabajos = op.documentos.map((archivo) => ({ archivo: path.resolve(archivo) }))
  if (op.manifest) {
    if (!(await existe(op.manifest))) fallar(`No existe el manifest: ${op.manifest}`)
    let entradas
    try {
      entradas = JSON.parse(await readFile(op.manifest, 'utf-8'))
    } catch (e) {
      fallar(`El manifest no es JSON válido: ${e.message}`)
    }
    if (!Array.isArray(entradas)) fallar('El manifest debe ser un array JSON: [{ "archivo": "...", ... }]')
    for (const e of entradas) {
      if (!e || typeof e.archivo !== 'string') fallar('Cada entrada del manifest necesita "archivo".')
      if (e.fecha && !FECHA_RE.test(e.fecha)) fallar(`Fecha inválida en el manifest para ${e.archivo}: "${e.fecha}" (usa YYYY-MM-DD).`)
      trabajos.push({ archivo: path.resolve(path.dirname(path.resolve(op.manifest)), e.archivo), fecha: e.fecha, categoria: e.categoria, titulo: e.titulo })
    }
  }
  if (trabajos.length === 0) fallar('No se indicó ningún documento. Pasa rutas de archivos .docx/.pdf/.txt o un --manifest.')

  for (const t of trabajos) {
    if (!(await existe(t.archivo))) fallar(`No existe el documento: ${t.archivo}`)
    const ext = path.extname(t.archivo).toLowerCase()
    if (!EXTENSIONES.has(ext)) fallar(`Formato no soportado: ${t.archivo} (${ext || 'sin extensión'}). Solo .docx, .pdf o .txt. Los .doc antiguos: guárdalos como .docx.`)
  }

  // codex disponible y logueado — solo si de verdad vamos a formatear.
  if (!op.soloPlan) {
    try {
      await ejecutar('codex', ['--version'])
    } catch {
      fallar('No se encontró el comando "codex". Instálalo (brew install codex) y ejecuta "codex login".')
    }
    try {
      // codex imprime el estado por stderr — revisar ambos streams.
      const { stdout, stderr } = await ejecutar('codex', ['login', 'status'])
      if (!/logged in/i.test(stdout + stderr)) fallar('Codex no tiene sesión iniciada. Ejecuta "codex login" primero.')
    } catch (e) {
      fallar(`No se pudo verificar la sesión de codex: ${e.message}`)
    }
  }

  const { categorias, slugs: slugsExistentes } = await leerPostsExistentes(repoPath)
  const hoy = fechaLocalISO(new Date())

  // --- Plan: fecha por documento, sin gastar nada --------------------------

  console.log(`\nPlan del lote (${trabajos.length} documento${trabajos.length === 1 ? '' : 's'}, ${paralelo} a la vez):\n`)
  let planInvalido = false
  for (const t of trabajos) {
    const ext = path.extname(t.archivo).toLowerCase()
    if (t.fecha) {
      t.fuenteFecha = 'manifest'
    } else if (ext === '.docx') {
      const f = await fechaDeDocx(t.archivo)
      if (f) {
        t.fecha = f
        t.fuenteFecha = 'metadatos del .docx'
      }
    } else if (ext === '.pdf') {
      try {
        const parsed = await pdfParse(await readFile(t.archivo))
        t.textoCacheado = parsed.text.trim()
        const f = fechaDePdfInfo(parsed.info)
        if (f) {
          t.fecha = f
          t.fuenteFecha = 'metadatos del .pdf'
        }
      } catch (e) {
        t.errorPlan = `No se pudo leer el PDF: ${e.message}`
      }
    }
    if (!t.fecha && !t.errorPlan) {
      const st = await stat(t.archivo)
      const nacimiento = st.birthtime && st.birthtime.getTime() > 0 ? st.birthtime : null
      if (nacimiento) {
        t.fecha = fechaLocalISO(nacimiento)
        t.fuenteFecha = '⚠ fecha del archivo en disco (birthtime) — puede ser la de una copia, verifícala'
      } else {
        t.errorPlan = 'Sin fecha de creación detectable — añade "fecha" en el manifest.'
      }
    }
    if (t.fecha && t.fecha > hoy) {
      t.errorPlan = `La fecha detectada (${t.fecha}) está en el futuro — corrige con "fecha" en el manifest.`
    }
    if (t.errorPlan) {
      planInvalido = true
      console.log(`  ✗ ${path.basename(t.archivo)}\n      ${t.errorPlan}`)
    } else {
      const extras = [t.categoria && `categoría: ${t.categoria}`, t.titulo && `título fijado: "${t.titulo}"`].filter(Boolean).join(' · ')
      console.log(`  • ${path.basename(t.archivo)} → fecha ${t.fecha} (${t.fuenteFecha})${extras ? ` · ${extras}` : ''}`)
    }
  }
  console.log(`\nCategorías ya existentes en el sitio: ${categorias.length ? categorias.join(', ') : '(ninguna)'}${op.categoria ? ` · para este lote se fija: ${op.categoria}` : ''}`)

  if (planInvalido) fallar('Hay documentos sin fecha válida (marcados con ✗ arriba). Corrígelos con un manifest y vuelve a ejecutar. No se publicó nada.')
  if (op.soloPlan) {
    console.log('\n--solo-plan: no se publicó nada. Si las fechas de arriba son correctas, re-ejecuta sin --solo-plan.')
    return
  }

  // --- Procesamiento en paralelo -------------------------------------------

  const slugsReservados = new Set(slugsExistentes)
  let hechos = 0
  const resultados = await enParalelo(trabajos, paralelo, async (t) => {
    const nombre = path.basename(t.archivo)
    try {
      // 1) Texto en bruto.
      let texto = t.textoCacheado
      if (texto === undefined) {
        const ext = path.extname(t.archivo).toLowerCase()
        if (ext === '.docx') texto = (await mammoth.extractRawText({ path: t.archivo })).value.trim()
        else if (ext === '.pdf') texto = (await pdfParse(await readFile(t.archivo))).text.trim()
        else texto = (await readFile(t.archivo, 'utf-8')).trim()
      }
      if (texto.length < 20) throw new Error('El documento parece vacío o no se pudo extraer el texto.')

      // 2) Codex.
      const f = await formatearConCodex(texto, op.categoria ? [op.categoria] : categorias, op.modelo)

      // 3) Limpieza y overrides (el manifest manda; el prefijo de serie nunca queda).
      const titulo = quitarPrefijoSerie(t.titulo || f.titulo)
      let slug = sanitizarSlug(t.titulo ? t.titulo : f.slug)
      if (!slug) slug = sanitizarSlug(titulo)
      if (!slug) throw new Error(`No se pudo derivar un slug del título "${titulo}".`)
      const categoria = (t.categoria || op.categoria || f.categoria || '').trim()

      // 4) Colisiones de URL (el slug ES la URL, sin fecha): dentro del lote y
      //    contra lo ya publicado.
      if (slugsReservados.has(slug)) {
        throw new Error(`Ya existe una reflexión con el slug "${slug}" (URL /${slug}). Fija un "titulo" distinto en el manifest para este documento.`)
      }
      slugsReservados.add(slug)

      const nombreMd = `${t.fecha}-${slug}.md`
      const mdPath = path.join(repoPath, 'content', 'posts', nombreMd)
      if (await existe(mdPath)) throw new Error(`Ya existe ${nombreMd} — ¿este documento ya fue publicado?`)

      // 5) Imagen de portada.
      let imagenRelativa = ''
      if (!op.sinImagen) {
        imagenRelativa = `/img/${slug}.jpg`
        await generarImagen(f.image_prompt, falKey, path.join(repoPath, 'public', 'img', `${slug}.jpg`))
      }

      // 6) Escribir el .md (mismo formato que el app / content/README.md).
      const frontmatter = { titulo, fecha: t.fecha }
      if (categoria) frontmatter.categoria = categoria
      if (f.versiculo) frontmatter.versiculo = f.versiculo
      frontmatter.resumen = f.resumen
      if (imagenRelativa) frontmatter.imagen = imagenRelativa
      frontmatter.publicado = !op.borrador
      await mkdir(path.dirname(mdPath), { recursive: true })
      await writeFile(mdPath, matter.stringify(`${f.cuerpo_markdown.trim()}\n`, frontmatter), 'utf-8')

      hechos += 1
      console.log(`  ✓ [${hechos}/${trabajos.length}] ${nombre} → ${nombreMd}`)
      return { ok: true, archivo: t.archivo, fecha: t.fecha, slug, titulo, mdPath, imagenRelativa }
    } catch (e) {
      hechos += 1
      console.log(`  ✗ [${hechos}/${trabajos.length}] ${nombre}: ${e.message}`)
      return { ok: false, archivo: t.archivo, error: e.message }
    }
  })

  const exitos = resultados.filter((r) => r.ok)
  const fallos = resultados.filter((r) => !r.ok)

  // --- Resumen -------------------------------------------------------------

  console.log(`\nResumen: ${exitos.length} publicado${exitos.length === 1 ? '' : 's'} en el clon, ${fallos.length} con error.`)
  for (const r of exitos) console.log(`  ✓ ${r.fecha}  ${r.titulo}  → https://drluisangeldiaz.com/${r.slug}`)
  for (const r of fallos) console.log(`  ✗ ${r.archivo}\n      ${r.error}`)
  if (fallos.length > 0) {
    console.log('\nPara los fallidos: corrige la causa y re-ejecuta pasando SOLO esos archivos (los ya escritos no se tocan).')
  }

  // --- Build de verificación + un solo commit + push -----------------------

  if (!op.push) {
    if (exitos.length > 0) {
      console.log('\nNo se hizo commit ni push (falta --push). Los archivos quedaron escritos en el clon;')
      console.log(`revísalos y luego re-ejecuta añadiendo --push, o haz el commit+push a mano en ${repoPath}.`)
      console.log('OJO: re-ejecutar el script completo volvería a procesar los mismos documentos y fallaría')
      console.log('por duplicado — para publicar lo ya escrito usa git directamente:')
      console.log(`  cd ${repoPath} && git add content/posts public/img && git commit -m "reflexiones: lote histórico" && git push origin master`)
    }
    process.exitCode = fallos.length > 0 ? 1 : 0
    return
  }

  if (exitos.length === 0) {
    console.log('\nNada que publicar — no se hace commit.')
    process.exitCode = 1
    return
  }

  console.log('\nVerificando que el sitio compila con los posts nuevos (npm run build)…')
  const npmJunto = path.join(path.dirname(process.execPath), 'npm')
  const npmBin = (await existe(npmJunto)) ? npmJunto : 'npm'
  if (!(await existe(path.join(repoPath, 'node_modules')))) {
    console.log('  (node_modules no existe en el clon — corriendo npm install primero)')
    await ejecutar(npmBin, ['install'], { cwd: repoPath })
  }
  try {
    await ejecutar(npmBin, ['run', 'build'], { cwd: repoPath })
  } catch (e) {
    console.error(`\n✗ El build del sitio falló — NO se hizo commit ni push. Nada salió a producción.\n${e.message}`)
    process.exit(1)
  }
  console.log('  ✓ build ok')

  const fechas = exitos.map((r) => r.fecha).sort()
  const mensaje = `reflexiones: publica ${exitos.length} del archivo histórico (${fechas[0]} a ${fechas[fechas.length - 1]})`
  const archivos = exitos.flatMap((r) => {
    const lista = [path.relative(repoPath, r.mdPath)]
    if (r.imagenRelativa) lista.push(path.posix.join('public', r.imagenRelativa.replace(/^\//, '')))
    return lista
  })
  await ejecutar('git', ['add', ...archivos], { cwd: repoPath })
  await ejecutar('git', ['commit', '-m', mensaje], { cwd: repoPath })
  try {
    await ejecutar('git', ['push', 'origin', 'master'], { cwd: repoPath })
  } catch {
    await ejecutar('git', ['pull', '--rebase', 'origin', 'master'], { cwd: repoPath })
    await ejecutar('git', ['push', 'origin', 'master'], { cwd: repoPath })
  }
  console.log(`\n✓ Push hecho — el deploy (GitHub Action) publica el sitio en 1–2 minutos.`)
  process.exitCode = fallos.length > 0 ? 1 : 0
}

main().catch((e) => {
  console.error(`\n✗ Error inesperado: ${e.stack || e.message}`)
  process.exit(2)
})
