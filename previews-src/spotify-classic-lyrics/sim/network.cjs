'use strict';
// The app's only own network request is the consent-gated report upload in reporting.cjs (via
// fetch). In the preview that `fetch` is this function: it answers in memory with the receipt
// the real receiver returns ({ id, accepted: true }). The browser's real fetch is never used, and
// the copied page keeps the app's CSP (connect-src 'none'), which would block it anyway.
const computer = require('./computer.cjs');
const host = require('./host.cjs');
const config = require('../src/reporting-config.json'); // the simulated config (no real endpoint or key)

async function fetch(url, options = {}) {
  if (url !== config.endpoint || options.method !== 'POST') throw new TypeError('Failed to fetch');
  const body = JSON.parse(options.body);
  await computer.delay(900);
  host.post('notice', { notice: 'report-sent' });
  return { ok: true, status: 200, json: async () => ({ id: body.id, accepted: true }) };
}

module.exports = { fetch };
