'use strict';
// Simulated `process` for the app's main-process modules: the installed Windows Setup build (x64),
// started normally by the user (no --background, --self-test or portable-executable flag).
const computer = require('./computer.cjs');

module.exports = {
  platform: computer.os.platform,
  arch: computer.os.arch,
  argv: [`${computer.installDir}\\${computer.productName}.exe`],
  env: computer.env,
  type: 'browser',
  versions: {},
};
