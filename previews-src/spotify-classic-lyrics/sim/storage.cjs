'use strict';
// Simulated replacement for src/storage.cjs (same exports the app uses). The original reads and
// writes Spotify's Chromium local-storage LevelDB; here the same rules run against the simulated
// computer's in-memory profile:
//   * inspection works on a snapshot and never needs Spotify closed (inspectSnapshot);
//   * writing needs the database lock, so it fails with LEVEL_LOCKED while Spotify runs;
//   * exactly one property changes: enableLyricsVariationsInNPV = "CONTROL";
//   * other overrides are preserved; the previous value is saved in lyrics-backup.json for Undo;
//   * a stock profile without an override record gets one only when the prefs username matches an
//     existing key namespace; Undo deletes a record the fix created if it is empty again.
// Byte-level details (Chromium string encoding, origin size metadata, read-back verification) have
// no in-memory equivalent and are summarised as delays.
const computer = require('../sim/computer.cjs');

const FLAG = 'enableLyricsVariationsInNPV';
const TARGET = 'CONTROL';
const ORIGIN = 'https://xpui.app.spotify.com';
const SUFFIX = 'remote-config-overrides';
// Same identifier the original stores in the backup: base64 of the full Chromium key
// ("_" + origin + NUL + latin-1 marker + name).
const keyId = name => btoa(`_${ORIGIN}\0\x01${name}`);

function openDb(directory, { snapshot = false } = {}) {
  const db = computer.spotify.databases.get(directory);
  if (!db) throw Object.assign(new Error(`IO error: ${directory}\\CURRENT: The system cannot find the path specified.`), { code: 'LEVEL_DATABASE_NOT_OPEN' });
  if (!snapshot && computer.spotify.running) {
    throw Object.assign(new Error('Spotify is using its settings database.'), { code: 'LEVEL_LOCKED' });
  }
  return db;
}

function records(db, username) {
  const result = [], names = [...db.entries.keys()];
  for (const name of names) {
    if (name === SUFFIX || name.endsWith(`:${SUFFIX}`)) {
      const value = db.entries.get(name);
      const object = JSON.parse(value);
      if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('Spotify preference is not an object.');
      result.push({ name, value, object, existed: true });
    }
  }
  if (username && !result.some(r => r.name === `${username}:${SUFFIX}`)) {
    if (names.some(name => name.startsWith(`${username}:`))) result.push({ name: `${username}:${SUFFIX}`, value: null, object: {}, existed: false });
  }
  return result;
}

async function readUsername(prefs) {
  if (!prefs) return null;
  try {
    const text = computer.files.get(prefs);
    if (text === undefined) return null;
    const line = text.split(/\r?\n/).find(l => l.startsWith('autologin.canonical_username='));
    if (!line) return null;
    const username = JSON.parse(line.slice(line.indexOf('=') + 1));
    return typeof username === 'string' && /^[\w.@+-]{1,160}$/.test(username) ? username : null;
  } catch { return null; }
}

async function inspectDirect(candidate) {
  const result = records(openDb(candidate.directory, { snapshot: true }), candidate.username);
  return { directory: candidate.directory, profiles: result.length, fixed: result.length > 0 && result.every(r => r.object[FLAG] === TARGET), values: result.map(r => r.object[FLAG] ?? null) };
}

async function inspectSnapshot(candidate) {
  await computer.delay(220); // copy the database to a temporary folder, open the copy, delete it
  return inspectDirect(candidate);
}

async function readJson(file, fallback) {
  await computer.delay(4);
  if (!computer.files.has(file)) return fallback;
  return JSON.parse(computer.files.get(file));
}

async function writeJson(file, value) {
  await computer.delay(8);
  computer.files.set(file, JSON.stringify(value, null, 2));
}

async function change(candidate, backupFile, undo = false) {
  await computer.delay(40);
  const db = openDb(candidate.directory); // never bypasses Spotify's lock
  const result = records(db, candidate.username);
  if (!result.length) throw new Error('No signed-in Spotify profile found. Open Spotify, sign in, then quit it and retry.');
  const backup = await readJson(backupFile, { version: 1, records: [] });
  if (backup.version !== 1 || !Array.isArray(backup.records)) throw new Error('Unrecognized backup format.');
  const operations = [];
  let changed = 0;
  for (const record of result) {
    const key = keyId(record.name);
    let saved = backup.records.find(r => r.directory === candidate.directory && r.key === key);
    const object = { ...record.object };
    if (undo) {
      if (!saved) continue;
      if (saved.hadFlag) object[FLAG] = saved.previous; else delete object[FLAG];
    } else {
      if (object[FLAG] === TARGET) continue;
      if (!saved) {
        saved = { directory: candidate.directory, key, hadFlag: Object.hasOwn(object, FLAG), previous: object[FLAG] ?? null, existed: record.existed };
        backup.records.push(saved);
      }
      object[FLAG] = TARGET;
    }
    if (undo && !saved.existed && Object.keys(object).length === 0) operations.push({ type: 'del', name: record.name });
    else {
      const value = JSON.stringify(object);
      if (record.value === value) continue;
      operations.push({ type: 'put', name: record.name, value });
    }
    changed++;
  }
  if (!operations.length) {
    if (undo) { backup.records = backup.records.filter(r => r.directory !== candidate.directory); await writeJson(backupFile, backup); }
    return { changed: 0 };
  }
  await writeJson(backupFile, backup); // the previous flag is saved before committing
  await computer.delay(160);           // atomic batch (with origin size metadata) + read-back verification
  for (const op of operations) {
    if (op.type === 'del') db.entries.delete(op.name); else db.entries.set(op.name, op.value);
  }
  if (undo) {
    backup.records = backup.records.filter(r => r.directory !== candidate.directory);
    await writeJson(backupFile, backup);
  }
  return { changed };
}

module.exports = { FLAG, TARGET, ORIGIN, inspectDirect, inspectSnapshot, readUsername, change, readJson, writeJson };
