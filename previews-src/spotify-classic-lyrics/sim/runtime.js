// ---- Runtime: a tiny CommonJS loader for the modules above (sim/runtime.js) --------------------
// Module ids mirror the app's layout ("src/main.cjs", ...). `process`, `fetch`, `__dirname` and
// `__filename` are per-module parameters, so the app's code never sees the page's real fetch.
const cache = Object.create(null);
let simProcess;

function resolve(from, request) {
  if (request === 'electron') return from === 'src/preload.cjs' ? 'electron@renderer' : 'electron';
  if (!request.startsWith('.')) return request;
  // Relative requests resolve against the module's folder; stand-ins registered under bare names
  // ("electron", "node:os", ...) live in sim/.
  const parts = /^(src|sim)\//.test(from) ? from.split('/').slice(0, -1) : ['sim'];
  for (const part of request.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  return parts.join('/');
}

function load(id) {
  if (cache[id]) return cache[id].exports;
  const define = definitions[id];
  if (!define) throw new Error(`Cannot find module '${id}' (not part of the simulated runtime)`);
  const module = { id, exports: {}, loaded: false };
  cache[id] = module;
  const dir = id.startsWith('src/') ? appDirectory() : '';
  define.call(module.exports, module, module.exports, request => load(resolve(id, request)), simProcess, dir, dir && `${dir}\\${id.slice(4)}`, simulatedFetch);
  module.loaded = true;
  return module.exports;
}

const appDirectory = () => `${load('sim/computer.cjs').installDir}\\resources\\app.asar\\src`;
const simulatedFetch = (...args) => load('sim/network.cjs').fetch(...args);

simProcess = load('sim/process.cjs');
load('src/main.cjs');    // main process: Electron starts it first; it registers IPC and opens the window
load('src/preload.cjs'); // preload: exposes window.classicLyrics before the page's own script runs
