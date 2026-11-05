'use strict';
// Simulated Electron renderer/preload API: the two members src/preload.cjs uses.
const ipc = require('./ipc.cjs');

const contextBridge = {
  exposeInMainWorld(key, api) {
    Object.defineProperty(window, key, { value: api, enumerable: true, configurable: false, writable: false });
  },
};

const ipcRenderer = {
  invoke: (channel, ...args) => ipc.invoke(channel, args),
  on(channel, listener) { ipc.on(channel, listener); return ipcRenderer; },
  removeListener(channel, listener) { ipc.off(channel, listener); return ipcRenderer; },
};

module.exports = { contextBridge, ipcRenderer };
