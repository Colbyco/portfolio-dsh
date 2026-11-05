// PREVIEW ADDITION: per-request context shared by the safety wrapper (../weather.js) and the
// OpenWeatherMap compat client. The compat client records why an upstream lookup failed, so the
// wrapper can answer with a friendly error page where the original .catch() only logged.
const { AsyncLocalStorage } = require('node:async_hooks');

module.exports = new AsyncLocalStorage();
