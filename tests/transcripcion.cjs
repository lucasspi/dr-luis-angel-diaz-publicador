const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const ts = require('typescript')
const { createHash } = require('node:crypto')
;(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'transcriptor-test-'))
  try {
    for (const file of ['modelo', 'segmentos']) {
      const source = await fs.readFile(path.join(__dirname, '../src/main/lib/transcripcion', `${file}.ts`), 'utf8')
      await fs.writeFile(path.join(root, `${file}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)
    }
    const { GestorModelo } = require(path.join(root, 'modelo.js'))
    const { parrafosWhisper, revisarParrafos } = require(path.join(root, 'segmentos.js'))
    const data = Buffer.from('model fixture')
    const manifest = { nombre: 'fixture', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), url: 'https://example.invalid/model' }
    const folder = path.join(root, 'model')
    let llamadas = 0
    const modelos = new GestorModelo(folder, manifest, async () => { llamadas++; return new Response(data) })
    assert.equal((await modelos.consultar()).fase, 'ausente')
    await modelos.download()
    assert.equal((await modelos.consultar()).fase, 'listo')
    await modelos.download(); assert.equal(llamadas, 1)
    const boot = new GestorModelo(folder, manifest, async () => { throw new Error('Offline') })
    assert.equal((await boot.consultar()).fase, 'listo')
    await boot.usar(async file => {
      assert.equal((await fs.readFile(file)).toString(), data.toString())
      await assert.rejects(boot.eliminar(), /Espera/)
      assert.equal((await boot.consultar()).enUso, true)
    })
    await boot.eliminar(); assert.equal((await boot.consultar()).fase, 'ausente')
    let bad = true
    const retry = new GestorModelo(path.join(root, 'retry'), manifest, async () => new Response(bad ? Buffer.alloc(data.length) : data))
    await assert.rejects(retry.download(), /verificación/)
    assert.equal((await retry.consultar()).fase, 'error')
    await assert.rejects(fs.stat(retry.archivo))
    await assert.rejects(fs.stat(retry.archivo + '.part'))
    bad = false; await retry.download(); assert.equal((await retry.consultar()).fase, 'listo')
    let started
    const ready = new Promise(resolve => { started = resolve })
    const cancel = new GestorModelo(path.join(root, 'cancel'), manifest, async (_url, { signal }) => {
      started()
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')), { once: true }))
    })
    const downloading = cancel.download(); await ready; cancel.cancelar()
    await assert.rejects(downloading, /cancelada/)
    assert.equal((await cancel.consultar()).fase, 'error')
    const parsed = parrafosWhisper({ transcription: [
      { offsets: { from: 0, to: 1000 }, text: ' Señor,  gracias' },
      { offsets: { from: 1000, to: 3000 }, text: ' por este día.' },
      { offsets: { from: 5000, to: 8000 }, text: ' Amén.' }
    ] }, 10)
    assert.deepEqual(parsed, [{ inicio: 0, fin: 3, texto: 'Señor, gracias por este día.' }, { inicio: 5, fin: 8, texto: 'Amén.' }])
    assert.deepEqual(revisarParrafos(parsed, ['Gracias, Señor.', 'Amén.']), [{ inicio: 0, fin: 3, texto: 'Gracias, Señor.' }, { inicio: 5, fin: 8, texto: 'Amén.' }])
    assert.equal(revisarParrafos(parsed, undefined), undefined)
    assert.throws(() => revisarParrafos(parsed, ['']), /Vuelve/)
    assert.throws(() => revisarParrafos(parsed, ['', 'Amén']), /Cada/)
    assert.throws(() => parrafosWhisper({ transcription: [] }, 10), /No se detectó/)
    assert.throws(() => parrafosWhisper({ transcription: [{ offsets: { from: -1, to: 2 }, text: 'bad' }] }, 10), /orden/)
    console.log('PASS: model download/checksum, offline restart, retry, cancellation, deletion lock, grouping and immutable paragraph timestamps.')
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})().catch(error => { console.error(error); process.exitCode = 1 })
