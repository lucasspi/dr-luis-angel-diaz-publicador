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
