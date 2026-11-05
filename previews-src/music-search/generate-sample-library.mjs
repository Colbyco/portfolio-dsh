// Generates the bundled sample music library for the Music Search App preview.
//
// Every file is a tiny but valid MPEG-1 Layer III stream (a fraction of a second of digital
// silence: correct frame headers, all-zero side info and main data) wrapped in real ID3 tags:
//   - ID3v1   (128-byte "TAG" block at the end of the file)
//   - ID3v2.3 (Latin-1 or UTF-16 text frames: TIT2 TPE1 TALB TYER TCON COMM TRCK)
//   - ID3v2.4 (UTF-8 text frames; year in TDRC as the 2.4 spec requires)
// so that both tag code paths of the original Java program (and the "no tags" path) run.
//
// Metadata is clearly sample data: public-domain classical works and their composers, an album
// name of "Sample Library - ...", and a comment saying the audio is silence. No real audio,
// lyrics or recordings are included.
//
// Usage: node previews-src/music-search/generate-sample-library.mjs
// Output: public/previews/music-search/sample-music/**  +  public/previews/music-search/sample-music.json

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = resolve(here, "../../public/previews/music-search");
const libDir = join(outRoot, "sample-music");

const COMMENT = "Sample file: silent audio";
const CLASSICAL = 32; // ID3v1 genre index for "Classical"

// path is relative to sample-music/. Plain ASCII file names keep paths identical on every OS.
const tracks = [
  {
    path: "Baroque/Antonio Vivaldi/Spring - I. Allegro.mp3",
    audio: { kbps: 128, hz: 44100, mode: "joint", seconds: 0.6 },
    v1: { title: "Spring - I. Allegro", artist: "Antonio Vivaldi", album: "Sample Library - Baroque", year: "1725", track: 1, genre: CLASSICAL },
  },
  {
    path: "Baroque/George Frideric Handel/Water Music - Alla Hornpipe.mp3",
    audio: { kbps: 160, hz: 44100, mode: "stereo", seconds: 0.7 },
    v1: { title: "Water Music - Alla Hornpipe", artist: "George Frideric Handel", album: "Sample Library - Baroque", year: "1717", track: 2, genre: CLASSICAL },
    v2: { version: 3, enc: "latin1", title: "Water Music, Suite No. 2 - Alla Hornpipe", artist: "George Frideric Handel", album: "Sample Library - Baroque", year: "1717", genre: "Baroque", track: "2/4" },
  },
  {
    path: "Baroque/Johann Sebastian Bach/01 Prelude in C major, BWV 846.mp3",
    audio: { kbps: 192, hz: 44100, mode: "joint", seconds: 0.7 },
    v1: { title: "Prelude in C major, BWV 846", artist: "Johann Sebastian Bach", album: "Sample Library - Baroque", year: "1722", track: 3, genre: CLASSICAL },
    v2: { version: 3, enc: "latin1", title: "The Well-Tempered Clavier, Book I - Prelude in C major, BWV 846", artist: "Johann Sebastian Bach", album: "Sample Library - Baroque", year: "1722", genre: "(32)", track: "3/4" },
  },
  {
    path: "Baroque/Johann Sebastian Bach/02 Brandenburg Concerto No. 3 - Allegro.mp3",
    audio: { kbps: 256, hz: 48000, mode: "stereo", seconds: 0.6 },
    v2: { version: 3, enc: "latin1", title: "Brandenburg Concerto No. 3 in G major, BWV 1048 - I. Allegro", artist: "Johann Sebastian Bach", album: "Sample Library - Baroque", year: "1721", genre: "Baroque", track: "4/4" },
  },
  {
    path: "Classical/Ludwig van Beethoven/Fur Elise.mp3",
    audio: { kbps: 128, hz: 44100, mode: "joint", seconds: 0.8 },
    v1: { title: "Fur Elise", artist: "Ludwig van Beethoven", album: "Sample Library - Classical", year: "1810", track: 1, genre: CLASSICAL },
    v2: { version: 3, enc: "utf16", title: "Für Elise (Bagatelle No. 25 in A minor, WoO 59)", artist: "Ludwig van Beethoven", album: "Sample Library - Classical", year: "1810", genre: "Classical", track: "1/4" },
  },
  {
    path: "Classical/Ludwig van Beethoven/Symphony No. 5 - I. Allegro con brio.mp3",
    audio: { kbps: 320, hz: 48000, mode: "stereo", seconds: 0.6 },
    v2: { version: 3, enc: "latin1", title: "Symphony No. 5 in C minor, Op. 67 - I. Allegro con brio", artist: "Ludwig van Beethoven", album: "Sample Library - Classical", year: "1808", genre: "Symphony", track: "2/4" },
  },
  {
    path: "Classical/Wolfgang Amadeus Mozart/Eine kleine Nachtmusik - I. Allegro.mp3",
    audio: { kbps: 192, hz: 48000, mode: "joint", seconds: 0.6 },
    v2: { version: 4, enc: "utf8", title: "Eine kleine Nachtmusik, K. 525 - I. Allegro", artist: "Wolfgang Amadeus Mozart", album: "Sample Library - Classical", year: "1787", genre: "Chamber Music", track: "3/4" },
  },
  {
    path: "Classical/Wolfgang Amadeus Mozart/Rondo alla Turca.mp3",
    audio: { kbps: 96, hz: 32000, mode: "mono", seconds: 0.9 },
    v1: { title: "Piano Sonata No. 11 - Rondo alla Turca", artist: "Wolfgang Amadeus Mozart", album: "Sample Library - Classical", year: "1783", track: 4, genre: 105 /* Sonata */ },
    v2: { version: 3, enc: "latin1", title: "Piano Sonata No. 11 in A major, K. 331 - III. Rondo alla Turca", artist: "Wolfgang Amadeus Mozart", album: "Sample Library - Classical", year: "1783", genre: "Sonata", track: "4/4" },
  },
  {
    path: "Romantic/Antonin Dvorak/Symphony No. 9 - II. Largo.mp3",
    audio: { kbps: 128, hz: 44100, mode: "joint", seconds: 0.7 },
    v1: { title: "Symphony No. 9 - II. Largo", artist: "Antonin Dvorak", album: "Sample Library - Romantic", year: "1893", track: 1, genre: 106 /* Symphony */ },
    v2: { version: 3, enc: "utf16", title: "Symphony No. 9 \"From the New World\" - II. Largo", artist: "Antonín Dvořák", album: "Sample Library - Romantic", year: "1893", genre: "Symphony", track: "1/3" },
  },
  {
    path: "Romantic/Frederic Chopin/Nocturne Op. 9 No. 2.mp3",
    audio: { kbps: 64, hz: 32000, mode: "mono", seconds: 0.8 },
    v1: { title: "Nocturne Op. 9 No. 2", artist: "Frederic Chopin", album: "Sample Library - Romantic", year: "1832", track: 2, genre: CLASSICAL },
    v2: { version: 3, enc: "utf16", title: "Nocturne in E-flat major, Op. 9 No. 2", artist: "Frédéric Chopin", album: "Sample Library - Romantic", year: "1832", genre: "Classical", track: "2/3" },
  },
  {
    path: "Romantic/Pyotr Ilyich Tchaikovsky/Dance of the Sugar Plum Fairy.mp3",
    audio: { kbps: 112, hz: 44100, mode: "joint", seconds: 0.6 },
    v1: { title: "Dance of the Sugar Plum Fairy", artist: "Pyotr Ilyich Tchaikovsky", album: "Sample Library - Romantic", year: "1892", track: 3, genre: CLASSICAL },
  },
  {
    path: "Untitled voice memo.mp3",
    audio: { kbps: 32, hz: 32000, mode: "mono", seconds: 0.9 },
    // no tags at all: the program prints only the "Other Properties" block for it
  },
];

// ---------------------------------------------------------------------------------------------
// MPEG-1 Layer III silence

const BITRATE_INDEX = { 32: 1, 40: 2, 48: 3, 56: 4, 64: 5, 80: 6, 96: 7, 112: 8, 128: 9, 160: 10, 192: 11, 224: 12, 256: 13, 320: 14 };
const SAMPLE_RATE_INDEX = { 44100: 0, 48000: 1, 32000: 2 };
const CHANNEL_MODE = { stereo: 0, joint: 1, dual: 2, mono: 3 };

function silentMpegStream({ kbps, hz, mode, seconds }) {
  const frames = Math.max(4, Math.round((seconds * hz) / 1152));
  const slotBytes = 144000 * kbps; // frame length = slotBytes / hz (+1 padding byte)
  const base = Math.floor(slotBytes / hz);
  const rest = slotBytes % hz;
  const chunks = [];
  let acc = 0;
  for (let i = 0; i < frames; i++) {
    // Same padding schedule an encoder uses to keep the average bitrate exact at 44.1 kHz.
    acc += rest;
    let pad = 0;
    if (acc >= hz) { pad = 1; acc -= hz; }
    const frame = new Uint8Array(base + pad); // header + zeroed side info / main data = silence
    frame[0] = 0xff;
    frame[1] = 0xfb; // sync, MPEG-1, Layer III, no CRC
    frame[2] = (BITRATE_INDEX[kbps] << 4) | (SAMPLE_RATE_INDEX[hz] << 2) | (pad << 1);
    frame[3] = (CHANNEL_MODE[mode] << 6) | 0x04; // mode extension 0, not copyrighted, original, no emphasis
    chunks.push(frame);
  }
  return concat(chunks);
}

// ---------------------------------------------------------------------------------------------
// ID3v1

function latin1(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0xff) throw new Error(`Not Latin-1: ${text}`);
    out[i] = c;
  }
  return out;
}

function id3v1({ title, artist, album, year, track, genre }) {
  const tag = new Uint8Array(128); // zero-filled
  const put = (text, offset, length) => tag.set(latin1(text).subarray(0, length), offset);
  put("TAG", 0, 3);
  put(title, 3, 30); // ID3v1 fields are fixed width: longer values are truncated, as real taggers do
  put(artist, 33, 30);
  put(album, 63, 30);
  put(year, 93, 4);
  put(COMMENT, 97, 28);
  tag[125] = 0; // ID3v1.1: zero byte, then track number
  tag[126] = track;
  tag[127] = genre;
  return tag;
}

// ---------------------------------------------------------------------------------------------
// ID3v2.3 / ID3v2.4

function encodeText(text, enc) {
  switch (enc) {
    case "latin1":
      return { byte: 0, bytes: latin1(text), nul: [0] };
    case "utf16": {
      const bytes = new Uint8Array(2 + text.length * 2);
      bytes[0] = 0xff; bytes[1] = 0xfe; // BOM, little endian
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        bytes[2 + i * 2] = c & 0xff;
        bytes[3 + i * 2] = c >> 8;
      }
      return { byte: 1, bytes, nul: [0, 0] };
    }
    case "utf8":
      return { byte: 3, bytes: new TextEncoder().encode(text), nul: [0] };
    default:
      throw new Error(enc);
  }
}

function synchsafe(n) {
  return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
}

function be32(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function id3v2({ version, enc, title, artist, album, year, genre, track }) {
  const frames = [];
  const frame = (id, data) => {
    const size = version === 4 ? synchsafe(data.length) : be32(data.length);
    frames.push(concat([latin1(id), Uint8Array.from(size), new Uint8Array(2), data]));
  };
  const textFrame = (id, text) => {
    const t = encodeText(text, enc);
    frame(id, concat([Uint8Array.of(t.byte), t.bytes]));
  };
  textFrame("TIT2", title);
  textFrame("TPE1", artist);
  textFrame("TALB", album);
  textFrame(version === 4 ? "TDRC" : "TYER", year);
  textFrame("TCON", genre);
  textFrame("TRCK", track);
  {
    // COMM: encoding, language, empty short description (terminated), comment text
    const t = encodeText(COMMENT, enc);
    const emptyDescription = enc === "utf16" ? Uint8Array.of(0xff, 0xfe, 0, 0) : Uint8Array.from(t.nul);
    frame("COMM", concat([Uint8Array.of(t.byte), latin1("eng"), emptyDescription, t.bytes]));
  }
  const body = concat([...frames, new Uint8Array(64)]); // 64 bytes of padding, like most taggers
  const header = concat([latin1("ID3"), Uint8Array.of(version, 0, 0), Uint8Array.from(synchsafe(body.length))]);
  return concat([header, body]);
}

// ---------------------------------------------------------------------------------------------

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

rmSync(libDir, { recursive: true, force: true });
const manifest = [];
for (const t of tracks) {
  const bytes = concat([
    t.v2 ? id3v2(t.v2) : new Uint8Array(0),
    silentMpegStream(t.audio),
    t.v1 ? id3v1(t.v1) : new Uint8Array(0),
  ]);
  const file = join(libDir, ...t.path.split("/"));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  manifest.push({
    path: t.path,
    size: bytes.length,
    tags: [t.v1 && "ID3v1", t.v2 && `ID3v2.${t.v2.version}`].filter(Boolean),
  });
}

// Sorted the way Windows (NTFS) lists directories, so the in-browser filesystem is populated in
// the same order a native run on Windows walks the folder.
manifest.sort((a, b) => {
  const pa = a.path.toUpperCase().split("/");
  const pb = b.path.toUpperCase().split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return pa.length - pb.length;
});

writeFileSync(
  join(outRoot, "sample-music.json"),
  JSON.stringify({ root: "sample-music", files: manifest }, null, 2) + "\n",
);
const totalBytes = manifest.reduce((n, f) => n + f.size, 0);
console.log(`Wrote ${manifest.length} MP3 files (${totalBytes} bytes) to ${libDir}`);
for (const f of manifest) console.log(`  ${f.path}  ${f.size} B  [${f.tags.join(", ") || "no tags"}]`);
