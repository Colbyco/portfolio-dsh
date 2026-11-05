'use strict';
// node:os answered by the simulated computer.
const computer = require('./computer.cjs');
module.exports = {
  release: () => computer.os.release,
  platform: () => computer.os.platform,
  arch: () => computer.os.arch,
  homedir: () => computer.home,
  tmpdir: () => computer.env.TEMP,
};
