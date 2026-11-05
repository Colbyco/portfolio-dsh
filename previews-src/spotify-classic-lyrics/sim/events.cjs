'use strict';
// Minimal EventEmitter (the subset Electron objects expose to the app).
class EventEmitter {
  constructor() { this._listeners = new Map(); }
  on(name, listener) {
    if (!this._listeners.has(name)) this._listeners.set(name, []);
    this._listeners.get(name).push(listener);
    return this;
  }
  once(name, listener) {
    const wrapped = (...args) => { this.removeListener(name, wrapped); listener(...args); };
    return this.on(name, wrapped);
  }
  removeListener(name, listener) {
    const list = this._listeners.get(name);
    if (list) { const i = list.indexOf(listener); if (i >= 0) list.splice(i, 1); }
    return this;
  }
  off(name, listener) { return this.removeListener(name, listener); }
  emit(name, ...args) {
    const list = [...(this._listeners.get(name) || [])];
    for (const listener of list) listener(...args);
    return list.length > 0;
  }
}
module.exports = { EventEmitter };
