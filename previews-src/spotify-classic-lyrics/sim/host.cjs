'use strict';
// Messages from the simulated app window to the preview page that frames it (window size,
// title-bar theme and "this was simulated" notices). No-op when the app page is opened directly.
function post(kind, data = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ source: 'classic-lyrics-preview', kind, ...data }, '/');
}
module.exports = { post };
