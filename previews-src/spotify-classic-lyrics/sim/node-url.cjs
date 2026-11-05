'use strict';
// node:url pathToFileURL for Windows paths.
const pathToFileURL = path => new URL(`file:///${String(path).replace(/\\/g, '/')}`);
module.exports = { pathToFileURL };
