'use strict';
// Simulated Electron main-process API: exactly the members src/main.cjs uses, backed by the
// simulated computer, the in-page IPC and the preview frame. The app behaves as the installed
// Windows Setup build (app.isPackaged), so updates and "Check and fix at startup" are available.
const computer = require('./computer.cjs');
const ipc = require('./ipc.cjs');
const host = require('./host.cjs');
const { EventEmitter } = require('./events.cjs');
const { pathToFileURL } = require('node:url');

const app = new (class App extends EventEmitter {
  get isPackaged() { return true; }
  getVersion() { return computer.appVersion; }
  getName() { return computer.productName; }
  getPath(name) {
    const paths = { userData: `${computer.env.APPDATA}\\${computer.productName}`, appData: computer.env.APPDATA, home: computer.home, temp: computer.env.TEMP };
    if (!paths[name]) throw new Error(`Failed to get '${name}' path`);
    return paths[name];
  }
  whenReady() { return Promise.resolve(); }
  requestSingleInstanceLock() { return true; }
  setLoginItemSettings(settings) { computer.loginItem = { openAtLogin: !!settings.openAtLogin, args: settings.args || [] }; }
  getLoginItemSettings() { return { openAtLogin: computer.loginItem.openAtLogin, wasOpenedAtLogin: false }; }
  isInApplicationsFolder() { return false; }
  disableHardwareAcceleration() {}
  quit() { /* not reachable from the window's interface */ }
  exit() {}
})();

function applyColorScheme(dark) {
  // Electron's nativeTheme drives prefers-color-scheme in the renderer; the app's style.css follows
  // it through `color-scheme: light dark` + light-dark(). Here the used scheme is set directly.
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  host.post('theme', { dark });
}

const nativeTheme = new (class NativeTheme extends EventEmitter {
  constructor() {
    super();
    this._source = 'system';
    this._dark = this.shouldUseDarkColors;
    applyColorScheme(this._dark);
    computer.onSystemThemeChange(() => this._refresh());
  }
  get themeSource() { return this._source; }
  set themeSource(value) {
    if (!['system', 'light', 'dark'].includes(value)) throw new TypeError(`Invalid themeSource: ${value}`);
    this._source = value;
    this._refresh();
  }
  get shouldUseDarkColors() { return this._source === 'dark' || (this._source === 'system' && computer.systemDark()); }
  _refresh() {
    const dark = this.shouldUseDarkColors;
    applyColorScheme(dark);
    if (dark !== this._dark) { this._dark = dark; this.emit('updated'); }
  }
})();

class WebContents extends EventEmitter {
  constructor(win) { super(); this._win = win; }
  send(channel, ...args) { ipc.send(channel, args); }
  setWindowOpenHandler() {}
}

class BrowserWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.url = null;
    this._size = [options.width || 800, options.height || 600];
    this.webContents = new WebContents(this);
    host.post('window', { width: this._size[0], height: this._size[1], title: options.title || '', background: options.backgroundColor || '' });
  }
  loadFile(file) {
    this.url = pathToFileURL(file).href;
    ipc.attachWindow(this);
    return Promise.resolve();
  }
  isDestroyed() { return false; }
  show() {}
  showInactive() {}
  focus() {}
  getSize() { return [...this._size]; }
  setSize(width, height) { this._size = [width, height]; host.post('window', { width, height }); }
  setBackgroundColor(color) { host.post('window', { background: color }); }
}

const ipcMain = {
  handle(channel, handler) {
    if (ipc.handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`);
    ipc.handlers.set(channel, handler);
  },
  removeHandler(channel) { ipc.handlers.delete(channel); },
};

const dialog = {
  // Only shown when Spotify is running; the simulated Spotify is closed, so this is not reached.
  async showMessageBox(_window, options) { return { response: options.defaultId || 0, checkboxChecked: false }; },
  async showSaveDialog(_window, options) {
    await computer.delay(600); // the visitor "picks" the suggested location
    return { canceled: false, filePath: `${computer.home}\\Documents\\${options.defaultPath}` };
  },
  showErrorBox(title, content) { console.error(`${title}: ${content}`); },
};

class Tray extends EventEmitter {
  constructor(image) { super(); this.image = image; this.tooltip = ''; this.menu = null; }
  setToolTip(text) { this.tooltip = text; }
  setContextMenu(menu) { this.menu = menu; }
}

module.exports = {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu: { setApplicationMenu() {}, buildFromTemplate: template => ({ items: template }) },
  Tray,
  nativeImage: { createFromPath: path => ({ path, setTemplateImage() {} }) },
  nativeTheme,
  shell: { openExternal: async () => {} },
};
