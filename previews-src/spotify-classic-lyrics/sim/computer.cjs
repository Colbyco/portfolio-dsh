'use strict';
// The simulated Windows PC the preview runs on. Everything here lives in this page's memory and
// is rebuilt on every page load: nothing is read from or written to the visitor's computer.
//
// Scenario: Windows 11 x64, Spotify for Windows 1.3.6.1921 (the version docs/details.md says the
// fix was verified against) installed for the current user, signed in, currently closed, and its
// lyrics preference not yet set (Spotify's default full-window lyrics).
const APP_VERSION = '__APP_VERSION__';   // replaced at build time from package.json "version"
const PRODUCT_NAME = '__PRODUCT_NAME__'; // replaced at build time from package.json "productName"

const home = 'C:\\Users\\you';
const env = {
  USERPROFILE: home,
  APPDATA: `${home}\\AppData\\Roaming`,
  LOCALAPPDATA: `${home}\\AppData\\Local`,
  TEMP: `${home}\\AppData\\Local\\Temp`,
};
const username = 'preview-listener';

// Plain files on the simulated disk (path -> text).
const files = new Map([
  [`${env.APPDATA}\\Spotify\\prefs`, `autologin.canonical_username="${username}"\napp.last-launched-version="1.3.6.1921"\n`],
]);

// Spotify's Chromium local-storage databases (directory -> { entries: storage key -> JSON text }).
// The signed-in profile already has a remote-config-overrides record, without the lyrics flag.
const databases = new Map([
  [`${env.LOCALAPPDATA}\\Spotify\\Browser\\Local Storage\\leveldb`, { entries: new Map([[`${username}:remote-config-overrides`, '{}']]) }],
]);

// System appearance. Inside the portfolio the shell's theme plays the role of the OS theme: it is
// passed as #theme=light|dark and later as postMessage({ type: 'portfolio:theme', theme }).
let systemTheme = /(?:^|[#&])theme=(light|dark)\b/.exec(location.hash)?.[1] || null;
const media = matchMedia('(prefers-color-scheme: dark)');
const themeListeners = new Set();
const notifyTheme = () => { for (const listener of themeListeners) listener(); };
media.addEventListener('change', () => { if (!systemTheme) notifyTheme(); });
window.addEventListener('message', event => {
  const data = event.data;
  if (event.source !== window.parent && event.source !== window) return;
  if (!data || data.type !== 'portfolio:theme' || (data.theme !== 'light' && data.theme !== 'dark')) return;
  if (data.theme === systemTheme) return;
  systemTheme = data.theme;
  notifyTheme();
});

module.exports = {
  appVersion: APP_VERSION,
  productName: PRODUCT_NAME,
  env,
  home,
  installDir: `${env.LOCALAPPDATA}\\Programs\\${PRODUCT_NAME}`,
  os: { release: '10.0.26100', platform: 'win32', arch: 'x64' },
  files,
  spotify: { running: false, databases, username },
  loginItem: { openAtLogin: false, args: [] },
  systemDark: () => (systemTheme ? systemTheme === 'dark' : media.matches),
  onSystemThemeChange: listener => themeListeners.add(listener),
  delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
};
