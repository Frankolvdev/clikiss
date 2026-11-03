const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

function createRuntime(environment = {}) {
  const indexedDB = new IDBFactory();
  const window = new EventTarget();
  const cache = new Map();
  function load(name) {
    const filename = path.resolve(__dirname, '../app', `${name.replace(/^\.\//, '')}.ts`);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    vm.runInNewContext(compiled.outputText, { exports, require: load, Blob, Event, indexedDB, IDBKeyRange, window, ...environment }, { filename });
    return exports;
  }
  return { load, indexedDB, window };
}
module.exports = { createRuntime };
