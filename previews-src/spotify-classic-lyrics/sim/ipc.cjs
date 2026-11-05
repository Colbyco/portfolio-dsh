'use strict';
// In-page stand-in for Electron IPC between the simulated main process and the renderer.
//   ipcRenderer.invoke -> ipcMain.handle: arguments and results are structured-cloned and errors are
//     re-thrown with Electron's "Error invoking remote method '<channel>': Error: ..." prefix (the
//     renderer strips exactly that prefix). Calls wait until the window has loaded the page.
//   webContents.send -> ipcRenderer.on: asynchronous, structured-cloned.
const handlers = new Map();
const listeners = new Map();
let markLoaded;
const loaded = new Promise(resolve => { markLoaded = resolve; });
const pageReady = new Promise(resolve => {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resolve, { once: true });
  else resolve();
});
const hop = () => new Promise(resolve => setTimeout(resolve, 0));

function attachWindow(win) { pageReady.then(() => markLoaded(win)); }

async function invoke(channel, args) {
  const payload = structuredClone(args);
  const win = await loaded;
  await hop();
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`Error invoking remote method '${channel}': Error: No handler registered for '${channel}'`);
  let result;
  try { result = await handler({ sender: win.webContents, senderFrame: { url: win.url } }, ...payload); }
  catch (error) { throw new Error(`Error invoking remote method '${channel}': ${error}`); }
  await hop();
  return structuredClone(result);
}

function send(channel, args) {
  const payload = structuredClone(args);
  setTimeout(() => {
    for (const listener of [...(listeners.get(channel) || [])]) listener({ sender: null }, ...structuredClone(payload));
  }, 0);
}

function on(channel, listener) {
  if (!listeners.has(channel)) listeners.set(channel, []);
  listeners.get(channel).push(listener);
}

function off(channel, listener) {
  const list = listeners.get(channel);
  if (list) { const i = list.indexOf(listener); if (i >= 0) list.splice(i, 1); }
}

module.exports = { handlers, attachWindow, invoke, send, on, off };
