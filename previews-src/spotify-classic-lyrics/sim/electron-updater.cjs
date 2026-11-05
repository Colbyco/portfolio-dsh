'use strict';
// Simulated electron-updater `autoUpdater`, driven by the original src/updates.cjs. It answers a
// check in memory as if the GitHub release feed's latest stable version is the running version
// (package.json "version"), so the app reports "Up to date". No network request is made.
const computer = require('./computer.cjs');
const { EventEmitter } = require('./events.cjs');

const autoUpdater = new EventEmitter();
Object.assign(autoUpdater, {
  autoDownload: true,
  autoInstallOnAppQuit: true,
  allowPrerelease: false,
  allowDowngrade: false,
  disableWebInstaller: false,
  logger: null,
  async checkForUpdates() {
    autoUpdater.emit('checking-for-update');
    await computer.delay(1100); // latest.yml round trip
    const info = { version: computer.appVersion };
    autoUpdater.emit('update-not-available', info);
    return { isUpdateAvailable: false, updateInfo: info, versionInfo: info, downloadPromise: null, cancellationToken: null };
  },
  quitAndInstall() {},
});

module.exports = { autoUpdater };
