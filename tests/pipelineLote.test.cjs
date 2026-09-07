const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
for (const failPush of [false, true]) test(`batch pushes once after all documents; push failure=${failPush}`, async () => {
  const events = [], calls = []
  const mocks = {
    './git': { sincronizar: async () => {} },
    './reflexiones': { leerCatalogo: async () => [] },
    './publish': { enviarCambios: async () => { calls.push('push'); if (failPush) throw new Error('offline') } },
    './pipeline': {
      prepararDocumento: async path => ({path}),
      publicarDocumentoPreparado: async (doc, category, config, progress, notify, defer) => {
        assert.equal(defer, true)
        assert.equal(notify, doc.path !== 'b')
        calls.push(doc.path)
        return {url: 'https://example.com/' + doc.path}
      }
    }
  }
  const exports = {}
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/main/lib/pipelineLote.ts'), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {exports, require: name => mocks[name], Error})
  const result = await exports.procesarDocumentosEnLote(['a','b','c'], 'Fe', {repoPath:'/test'}, event => { if(event.tipo === 'exito') assert.equal(calls.at(-1), 'push'); events.push(event) }, ['a','c'])
  assert.deepEqual(calls, ['a','b','c','push'])
  assert.equal(result.length, 3)
  assert.ok(result.every(r => r.status === (failPush ? 'erro' : 'exito')))
  assert.equal(events.filter(e => e.tipo === 'exito').length, failPush ? 0 : 3)
})
