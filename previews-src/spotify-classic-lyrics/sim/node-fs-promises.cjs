'use strict';
// node:fs/promises over the simulated disk (readFile for Spotify's prefs in diagnostics.cjs,
// writeFile for "Save instead" in main.cjs). Nothing touches the visitor's file system.
const computer = require('./computer.cjs');
const host = require('./host.cjs');

const missing = (syscall, file) => Object.assign(new Error(`ENOENT: no such file or directory, ${syscall} '${file}'`), { code: 'ENOENT', syscall, path: file });

async function readFile(file) {
  await computer.delay(2);
  if (!computer.files.has(file)) throw missing('open', file);
  return computer.files.get(file);
}

async function writeFile(file, data) {
  await computer.delay(4);
  computer.files.set(file, String(data));
  host.post('notice', { notice: 'file-saved' });
}

module.exports = { readFile, writeFile };
