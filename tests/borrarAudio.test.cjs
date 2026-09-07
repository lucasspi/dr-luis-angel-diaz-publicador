const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
function setup({dirty=false, fail=false, committed=false}={}) {
  let catalog = [{id:'one',titulo:'One',imagen:'/img/oraciones/one.jpg',transcripcion:'one.json'},{id:'two',titulo:'Two'}]
  const calls=[]; let head='before'
  const mocks={
    'node:fs/promises': {readFile:async()=>JSON.stringify({oraciones:catalog}),writeFile:async(p,s)=>{catalog=JSON.parse(s).oraciones}},
    './git': {sincronizar:async()=>{},git:async(args)=>{calls.push(args);if(args[0]==='status')return dirty?' M x':'';if(args[0]==='rev-parse')return head;return ''}},
    './publish': {confirmar:async()=>{if(committed)head='after';if(fail)throw Error('failed');head='after'}}
  }
  const exports={}
  const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main/lib/audios.ts'),'utf8')
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require:n=>mocks[n]||(n.startsWith('node:')?require(n):{}),Error})
  return {exports,calls,catalog:()=>catalog}
}
test('delete removes only selected catalog entry and associated files',async()=>{
 const e=setup();await e.exports.borrarAudio('/test','one');assert.equal(e.catalog().length,1);assert.equal(e.catalog()[0].id,'two');
 assert.deepEqual(Array.from(e.calls.find(c=>c[0]==='rm')),['rm','--','public/audio/one.mp3','public/img/oraciones/one.jpg','content/oraciones/one.json'])
})
test('delete rejects unsafe ids and dirty checkout before mutation',async()=>{
 for(const id of ['../one','one']){const e=setup({dirty:true});await assert.rejects(e.exports.borrarAudio('/test',id));assert.ok(!e.calls.some(c=>c[0]==='rm'))}
})
test('failed commit restores staged files; failed push preserves committed deletion',async()=>{
 for(const committed of [false,true]){const e=setup({fail:true,committed});await assert.rejects(e.exports.borrarAudio('/test','one'));assert.equal(e.calls.some(c=>c[0]==='checkout'),!committed)}
})
