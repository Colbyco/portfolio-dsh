'use strict';
// Simulated replacement for src/platform.cjs (same exports). locations() is the original code;
// discovery, the Spotify process checks and stop/start are answered by the simulated computer
// (the original uses the file system, tasklist.exe, taskkill.exe and Spotify.exe).
const path = require('node:path');
const os = require('node:os');
const computer = require('../sim/computer.cjs');
const { readUsername } = require('./storage.cjs');

// Verbatim from src/platform.cjs.
function locations(platform = process.platform, env = process.env, home = os.homedir()) {
  const roots = [];
  if (platform === 'win32') {
    if (env.LOCALAPPDATA) roots.push({ root: path.join(env.LOCALAPPDATA, 'Spotify'), prefs: path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Spotify', 'prefs') });
  } else if (platform === 'darwin') {
    const prefs = path.join(home, 'Library', 'Application Support', 'Spotify', 'prefs');
    roots.push({ root: path.join(home, 'Library', 'Caches', 'com.spotify.client'), prefs }, { root: path.join(home, 'Library', 'Application Support', 'Spotify', 'PersistentCache'), prefs }, { root: path.join(home, 'Library', 'Application Support', 'Spotify'), prefs });
  }
  return roots.flatMap(({ root, prefs }) => ['Browser', 'Default', ''].map(profile => ({ directory: path.join(root, profile, 'Local Storage', 'leveldb'), prefs, installation: 'spotify-desktop' })));
}

// The simulated computer has one desktop install with one profile, so selection is a no-op.
async function selectCurrentProfiles(candidates) { return candidates; }

async function discover() {
  await computer.delay(80); // directory checks (+ Microsoft Store package folders: none here)
  const existing = [], seen = new Set();
  for (const candidate of locations()) {
    if (seen.has(candidate.directory)) continue; seen.add(candidate.directory);
    if (!computer.spotify.databases.has(candidate.directory)) continue;
    existing.push({ ...candidate, username: await readUsername(candidate.prefs) });
  }
  return selectCurrentProfiles(existing);
}

async function isSpotifyRunning() {
  await computer.delay(140); // tasklist.exe /FI "IMAGENAME eq Spotify.exe"
  return computer.spotify.running;
}

async function stopSpotify() {
  await computer.delay(500);
  computer.spotify.running = false;
}

async function openSpotify() {
  await computer.delay(200);
  computer.spotify.running = true;
}

module.exports = { locations, selectCurrentProfiles, discover, isSpotifyRunning, stopSpotify, openSpotify };
