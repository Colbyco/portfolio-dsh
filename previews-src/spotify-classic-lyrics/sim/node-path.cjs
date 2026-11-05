'use strict';
// node:path (win32 flavour), the functions the app's modules use.
const sep = '\\';

function normalize(value) {
  const text = String(value).replace(/[\\/]+/g, sep);
  const drive = /^[A-Za-z]:/.exec(text)?.[0] || '';
  const absolute = text.slice(drive.length).startsWith(sep);
  const parts = [];
  for (const part of text.slice(drive.length).split(sep)) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length && parts[parts.length - 1] !== '..') parts.pop();
    else if (part !== '..' || !absolute) parts.push(part);
  }
  return drive + (absolute ? sep : '') + parts.join(sep) || '.';
}

const join = (...parts) => normalize(parts.filter(part => part !== '').join(sep));
const dirname = value => { const p = normalize(value); const i = p.lastIndexOf(sep); return i <= 2 && /^[A-Za-z]:\\/.test(p) ? p.slice(0, 3) : i > 0 ? p.slice(0, i) : '.'; };
const basename = (value, ext) => { const name = normalize(value).split(sep).pop(); return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name; };
const extname = value => { const name = basename(value); const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i) : ''; };

module.exports = { sep, normalize, join, dirname, basename, extname, win32: null };
module.exports.win32 = module.exports;
