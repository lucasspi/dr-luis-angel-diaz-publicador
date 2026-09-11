const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')
const matter = require('gray-matter')
test('publication stores explicit email opt-in, defaulting to site-only', async () => {
  const source = await fs.readFile(path.join(__dirname, '../src/main/lib/writePost.ts'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const exports = {}; vm.runInNewContext(js, { exports, require })
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'drluis-opt-in-'))
  try {
    for (const [i, comunicar] of [undefined, false, true, 'true'].entries()) {
      const { mdPath } = await exports.escribirPost(root, { titulo: 'Prueba', fecha: '2026-09-07', temaId: 'fe', versiculo: '', resumen: 'Resumen', slug: `prueba-${i}`, cuerpo_markdown: 'Texto de prueba.', imagenRelativa: '', comunicar })
      const { data } = matter(await fs.readFile(mdPath, 'utf8'))
      assert.equal(data.publicado, true); assert.equal(data.comunicar, comunicar === true)
    }
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('the Portuguese version lands in posts/pt/ with the same name and only the fields that change language', async () => {
  const source = await fs.readFile(path.join(__dirname, '../src/main/lib/writePost.ts'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const exports = {}; vm.runInNewContext(js, { exports, require })
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'drluis-pt-'))
  try {
    const base = { titulo: 'Prueba', fecha: '2026-09-11', temaId: 'fe', versiculo: 'Juan 6:37', resumen: 'Resumen', cuerpo_markdown: 'Texto de prueba.', imagenRelativa: '/img/x.jpg', comunicar: true }
    const sinPt = await exports.escribirPost(root, { ...base, slug: 'solo-es' })
    assert.equal(sinPt.mdPathPt, null)

    const conPt = await exports.escribirPost(root, { ...base, slug: 'con-pt', pt: { titulo: 'Teste', versiculo: 'João 6:37', resumen: 'Resumo', cuerpo_markdown: 'Texto de teste.' } })
    assert.equal(conPt.mdPathPt, path.join(root, 'content', 'posts', 'pt', '2026-09-11-con-pt.md'))
    const { data, content } = matter(await fs.readFile(conPt.mdPathPt, 'utf8'))
    assert.deepEqual(data, { titulo: 'Teste', resumen: 'Resumo', versiculo: 'João 6:37' })
    assert.equal(content.trim(), 'Texto de teste.')
    // el español no cambia por tener hermana
    const es = matter(await fs.readFile(conPt.mdPath, 'utf8'))
    assert.equal(es.data.titulo, 'Prueba'); assert.equal(es.data.fecha, '2026-09-11'); assert.equal(es.data.comunicar, true)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})
