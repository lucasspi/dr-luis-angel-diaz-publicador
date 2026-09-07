// Optional smoke test: downloads the real model separately into this Mac's app data.
// Uses generated speech, never a private recording and never publishes anything.
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const ts = require('typescript')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
;(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oracion-real-'))
  try {
    for (const file of ['modelo', 'motor', 'segmentos']) {
      const source = await fs.readFile(path.join(__dirname, '../src/main/lib/transcripcion', `${file}.ts`), 'utf8')
      await fs.writeFile(path.join(root, `${file}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)
    }
    const { GestorModelo } = require(path.join(root, 'modelo.js'))
    const { ejecutarWhisper } = require(path.join(root, 'motor.js'))
    const { parrafosWhisper } = require(path.join(root, 'segmentos.js'))
    const modelos = new GestorModelo(path.join(os.homedir(), 'Library/Application Support/dr-luis-angel-diaz-publicador/models/whisper'))
    let progress = -1
    const timer = setInterval(async () => {
      const estado = await modelos.consultar()
      const bucket = Math.floor(estado.porcentaje / 10)
      if (bucket !== progress) { progress = bucket; console.log('Model:', estado.fase, estado.porcentaje + '%') }
    }, 2000)
    try { await modelos.download() } finally { clearInterval(timer) }
    assert.equal((await modelos.consultar()).fase, 'listo')
    execFileSync('say', ['-v', 'Monica', '-o', path.join(root, 'voz.aiff'), 'Señor, gracias por este día. Gracias por nuestra familia y por tu amor. Acompáñanos y danos paz. Amén.'])
    execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(root, 'voz.aiff'), '-ar', '16000', '-ac', '1', path.join(root, 'voz.wav')])
    const length = Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path.join(root, 'voz.wav')], { encoding: 'utf8' })).format.duration)
    await modelos.usar(modelo => ejecutarWhisper(modelo, path.join(root, 'voz.wav'), path.join(root, 'out'), new AbortController().signal, n => console.log('Transcribing:', n)))
    const parrafos = parrafosWhisper(JSON.parse(await fs.readFile(path.join(root, 'out.json'), 'utf8')), length)
    assert(parrafos.length > 0)
    assert.match(parrafos.map(p => p.texto).join(' '), /familia/i)
    // Preserve only this synthetic fixture for browser QA; it is never source content.
    const fixture = path.join(os.tmpdir(), 'publicador-transcripcion-fixture')
    await fs.mkdir(fixture, { recursive: true })
    execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(root, 'voz.wav'), '-ac', '1', '-ar', '24000', '-b:a', '48k', '-y', path.join(fixture, 'voz.mp3')])
    await fs.writeFile(path.join(fixture, 'parrafos.json'), JSON.stringify({ parrafos, duracion: length }, null, 2))
    console.log('PASS real local Whisper:', JSON.stringify(parrafos))
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})().catch(e => { console.error(e); process.exitCode = 1 })
