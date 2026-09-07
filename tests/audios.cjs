// Integration against temporary repositories only; never pushes to GitHub.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
;(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'test-oraciones-'))
  try {
    for (const file of ['audios', 'git', 'temas', 'slug', 'imageGen', 'publish', 'transcripcion/motor', 'transcripcion/segmentos']) {
      const source = await fs.readFile(path.join(__dirname, '../src/main/lib', `${file}.ts`), 'utf8')
      await fs.mkdir(path.dirname(path.join(root, `${file}.js`)), { recursive: true })
      await fs.writeFile(path.join(root, `${file}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)
    }
    const { prepararAudio, publicarAudio, listarAudios, transcribirAudio, generarImagenAudio, quitarImagenAudio, editarAudio } = require(path.join(root, 'audios.js'))
    const remote = path.join(root, 'remote.git'), repo = path.join(root, 'repo')
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    await fs.mkdir(repo)
    git('init', '--bare', remote); git('init', '-b', 'master')
    git('config', 'user.name', 'Audio Test'); git('config', 'user.email', 'audio@example.invalid')
    await fs.writeFile(path.join(repo, 'README.md'), 'Temporary fixture')
    git('add', '.'); git('commit', '-m', 'fixture'); git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'master')
    const input = path.join(root, 'voice.wav')
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', input])
    await assert.rejects(prepararAudio(path.join(root, 'invalid.txt')), /Selecciona/)
    const empty = path.join(root, 'empty.mp3'); await fs.writeFile(empty, '')
    await assert.rejects(prepararAudio(empty), /50 MB/)
    const corrupt = path.join(root, 'corrupt.mp3'); await fs.writeFile(corrupt, 'not audio')
    await assert.rejects(prepararAudio(corrupt), /No se pudo leer/)
    const audio = await prepararAudio(input)
    require(path.join(root, 'transcripcion/motor.js')).ejecutarWhisper = async (_model, _wav, output) => {
      await fs.writeFile(output + '.json', JSON.stringify({ transcription: [
        { offsets: { from: 0, to: 900 }, text: 'Gracias, Señor.' },
        { offsets: { from: 1100, to: 1900 }, text: 'Amén.' }
      ] }))
    }
    const parrafos = await transcribirAudio(audio.id, { usar: fn => fn('fixture') }, () => {})
    assert.equal(parrafos.length, 2)
    await assert.rejects(publicarAudio(repo, audio.id, 'Oración', '', '', ['Incomplete']), /Vuelve a transcribir/)

    await assert.rejects(generarImagenAudio(audio.id, 'a prayer', ''), /falApiKey/)
    require(path.join(root, 'imageGen.js')).generarImagen = async (_prompt, _key, dest) => { await fs.writeFile(dest, 'jpeg-bytes') }
    const { preview } = await generarImagenAudio(audio.id, 'soft light over a quiet home', 'key')
    assert(preview.startsWith('data:image/jpeg;base64,'))
    quitarImagenAudio(audio.id)
    await generarImagenAudio(audio.id, 'soft light over a quiet home', 'key')

    assert(audio.bytes < audio.bytesOriginal); assert(audio.duracion > 1.9 && audio.duracion < 2.2)
    assert(audio.preview.startsWith('data:audio/mpeg;base64,'))
    await assert.rejects(publicarAudio(repo, audio.id, '', '', ''), /título/)
    // Sólo bloquea lo que esta operación escribiría; otro trabajo a medias en el clone no estorba.
    await fs.mkdir(path.join(repo, 'content'), { recursive: true })
    await fs.writeFile(path.join(repo, 'content/oraciones.json'), '{"oraciones":[]}')
    await assert.rejects(publicarAudio(repo, audio.id, 'Oración', '', ''), /cambios pendientes/)
    await fs.rm(path.join(repo, 'content/oraciones.json'))
    await fs.writeFile(path.join(repo, 'pending.txt'), 'user edit')
    await fs.writeFile(path.join(repo, 'README.md'), 'Temporary fixture, edited')
    // Reject only pushes, so initial sync succeeds and tests the retry path.
    const hook = path.join(remote, 'hooks/pre-receive')
    await fs.writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    await assert.rejects(publicarAudio(repo, audio.id, 'Oración <familia>', 'Una pausa\nCon Dios', 'Familia', ['Gracias por este día.', 'Amén.']), /guardada localmente/)
    const commit = git('rev-parse', 'HEAD')
    assert.equal((await listarAudios(repo)).length, 1)
    await fs.rm(hook)
    const result = await publicarAudio(repo, audio.id, 'Oración <familia>', 'Una pausa\nCon Dios', 'Familia', ['Gracias por este día.', 'Amén.'])
    assert.equal(result.url, 'https://drluisangeldiaz.com/oraciones/oracion-familia'); assert.equal(git('rev-parse', 'HEAD'), commit)
    // El trabajo ajeno sigue donde estaba (autostash) y no entró en el commit.
    assert.equal(git('status', '--porcelain'), 'M README.md\n?? pending.txt')
    await fs.rm(path.join(repo, 'pending.txt')); git('checkout', '--', 'README.md')
    assert.equal(git('status', '--porcelain'), '')
    assert.equal(git('rev-parse', 'origin/master'), commit)
    await assert.rejects(publicarAudio(repo, audio.id, 'Duplicate', '', ''), /Vuelve a seleccionar/)
    const { cargarOraciones } = await import('../../site/content/oraciones.mjs')
    assert.equal(cargarOraciones(repo).length, 1)
    // Catálogo (tabla) + tema dado de alta en el mismo commit + transcripción aparte.
    const catalogo = JSON.parse(await fs.readFile(path.join(repo, 'content/oraciones.json'), 'utf8')).oraciones
    assert.equal(catalogo.length, 1); assert.equal(catalogo[0].id, audio.id); assert.equal(catalogo[0].slug, 'oracion-familia')
    assert.equal(catalogo[0].temaId, 'familia'); assert.equal(catalogo[0].transcripcion, `${audio.id}.json`); assert.equal(catalogo[0].parrafos, undefined)
    assert.equal(catalogo[0].imagen, `/img/oraciones/${audio.id}.jpg`)
    assert.equal(await fs.readFile(path.join(repo, 'public/img/oraciones', `${audio.id}.jpg`), 'utf8'), 'jpeg-bytes')
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(repo, 'content/temas.json'), 'utf8')).temas.map(t => t.id), ['familia'])
    assert.deepEqual(cargarOraciones(repo)[0].tema, { nombre: 'Familia', slug: 'familia' })
    assert.equal(git('show', '--stat', '--format=', 'HEAD').split('\n').filter(l => l.includes('|')).length, 5)
    assert.deepEqual(cargarOraciones(repo)[0].parrafos, [{ inicio: 0, fin: 0.9, texto: 'Gracias por este día.' }, { inicio: 1.1, fin: 1.9, texto: 'Amén.' }])
    // Editar: sólo el catálogo cambia (slug, audio y texto quedan), el tema nuevo entra en el mismo commit, y se sube.
    await assert.rejects(editarAudio(repo, audio.id, { titulo: 'Oración <familia>', descripcion: 'Una pausa\nCon Dios', tema: 'Familia' }), /nada que cambiar/)
    await assert.rejects(editarAudio(repo, 'no-existe', { titulo: 'x', descripcion: '', tema: '' }), /ya no está/)
    const editada = await editarAudio(repo, audio.id, { titulo: 'Oración por la familia', descripcion: 'Editada', tema: 'Hogar' })
    assert.equal(editada.slug, 'oracion-familia'); assert.equal(editada.temaId, 'hogar'); assert.equal(editada.transcripcion, `${audio.id}.json`)
    assert.equal((await listarAudios(repo))[0].titulo, 'Oración por la familia')
    assert.equal(git('rev-parse', 'origin/master'), git('rev-parse', 'HEAD')); assert.equal(git('status', '--porcelain'), '')
    assert.deepEqual(git('show', '--stat', '--format=', 'HEAD').split('\n').filter(l => l.includes('|')).map(l => l.trim().split(' ')[0]).sort(), ['content/oraciones.json', 'content/temas.json'])
    const sinTema = await editarAudio(repo, audio.id, { titulo: 'Oración por la familia', descripcion: 'Editada', tema: '' })
    assert.equal(sinTema.temaId, undefined)
    await fs.rm(path.join(repo, 'public/audio', `${audio.id}.mp3`))
    assert.throws(() => cargarOraciones(repo))
    console.log('PASS: compression, malformed inputs, validation, dirty repo, push failure/retry without duplicates, catalog and missing media.')
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})().catch(error => { console.error(error); process.exitCode = 1 })
