# Music Search App: live preview

Stage entry: `/previews/music-search/` (`public/previews/music-search/index.html`)

Original project: Colby Baker, December 2024, `github.com/Colbyco/music-search-app` (MIT). It is a
Maven console app (Java 23 target, dependency `com.mpatric:mp3agic:0.9.1`). The app prints
`Enter path to directory: `, reads one line from `System.in`, walks that folder with
`Files.walkFileTree`, and prints every `Directory:` and `File:` it visits. For each file it prints the
ID3v1 block (title, artist, album, year, genre), the ID3v2 block (the same fields plus comment and
track), and "Other Properties" (length, bitrate, sample rate, channel mode). It builds a
`HashMap<SongDetails, Mp3File>` that nothing reads yet; the search part was never written.

## What runs

**The real Java code**, not a port. In the browser:

| Piece | Version | Notes |
|---|---|---|
| CheerpJ (WebAssembly JVM + OpenJDK) | **5.0** (released 2026-10-30), `https://cjrtnc.leaningtech.com/5.0/loader.js` | Runs the `java 21` runtime (OpenJDK 21.0.x). Java 25 is only a preview in 5.0, so 21 is used. |
| Original classes | `java/music-app-1.0-SNAPSHOT.jar` (Maven's default artifact name) | Compiled from `original/src/main/java` (an unmodified copy of the repo) with `javac --release 21`. |
| mp3agic | `java/mp3agic-0.9.1.jar` | The exact version in the pom, downloaded from Maven Central; SHA-1 `235fe1d4a3da33a57e23166a2527a23310852c3f` is checked against the `.sha1` published there. MIT licence; the notices are in `java/LICENSES.txt`. |
| Browser launcher | `java/browser-console.jar` (`adapter/web/BrowserConsole.java`) | Not part of the original. See "Adaptations". |

`app.js` loads CheerpJ and calls `cheerpjInit({ version: 21, natives, preloadResources })`, then
`cheerpjRunMain("web.BrowserConsole", "/app/previews/music-search/java/browser-console.jar:…music-app-1.0-SNAPSHOT.jar:…mp3agic-0.9.1.jar")`.
Every line in the terminal comes from the JVM. The page only draws the terminal, echoes the line
you type (as a terminal would), and adds dimmed `#` notes and `$ java …` lines that are clearly
not program output.

## Adaptations (and why)

1. **Bytecode level 21 instead of 23.** CheerpJ 5.0 runs Java 8/11/17/21 (25 is a preview). The
   source only needs Java 9+ (`List.of`), so nothing else changes.
2. **Console I/O → page terminal.** A browser tab has no stdin/stdout. `web.BrowserConsole` sets
   `System.in`/`out`/`err` to small streams backed by CheerpJ JavaScript native methods (`readLine`,
   `write`), then calls `controller.MetadataExtractor.main(args)` unchanged. Output is UTF-8.
   If `main` throws, the launcher prints `Exception in thread "main" …` and the stack trace, as the
   JVM's default handler does, without its own frame.
3. **Run again.** When `main` returns, the page offers *Run again* (button or Enter), which calls
   `main` again in the same JVM. Natively you would type `java …` again. The original has no static
   state, so the behaviour is the same.
4. **Virtual disk.** Java in CheerpJ sees a virtual filesystem. CheerpJ's `/str/` mount has no
   directories ("CheerpOS: Directories are not supported"), so at startup the page fetches the
   bundled library and writes it to `/files/sample-music/` through the launcher's `putFile` helper
   (IndexedDB-backed, so it supports `walkFileTree`). Type `/files/sample-music`, or click
   *Scan sample library*.
5. **Visitor files (optional).** *Add MP3 files…* / *Add a folder…* read files with the browser
   File API (never uploaded) and copy them to `/files/your-mp3s/`, then enter that path. Only
   `.mp3` files are copied, at most 60 files / 150 MB: the original program wraps mp3agic's
   `InvalidDataException` in a `RuntimeException` and aborts the walk on the first non-MP3 file.
   The page says how many files it left out. Earlier picks are deleted when new files are picked
   and every time the page starts.

The header has the disclosure line ("The real Java program, not a port … via CheerpJ. A sample
library of silent MP3s is bundled"). The "Original Java source & what was adapted" panel lists the
adaptations and shows the original source (`source.json`, generated from `original/`).

## CheerpJ licence basis

From <https://cheerpj.com/docs/licensing> (read 2026-11-04): *"CheerpJ is free for personal,
educational and hobby use … The Community licence is free, and covers: Personal, educational and
hobby use …"*, and *"Community use loads CheerpJ from the CheerpJ CDN (`cjrtnc.leaningtech.com`)"*.
Self-hosting the runtime needs a paid licence. Their own example, *"You build a Java game or
educational applet and publish it on your own website → Community, free"*, matches a personal,
non-commercial portfolio. Therefore:

- the runtime is **always loaded from the CheerpJ CDN** and nothing from it is copied into this repo;
- no licence key is used; the program is console-only, so no CheerpJ display is created;
- the page still credits it: "via CheerpJ" in the header, and "Built with CheerpJ 5.0 (Community
  licence, loaded from the CheerpJ CDN)" in the source panel.

If the portfolio ever becomes commercial or business use, read the licensing page again.

## Third-party network requests

Only `https://cjrtnc.leaningtech.com/5.0/…`: `loader.js`, the JVM (`cj3.js`, `cj3.wasm`,
`cj3n21.wasm`) and byte ranges of the Java 21 class library (`21/lib/modules`, a few small jars).
CheerpJ loads these through a frame from that origin. No API keys, cookies or other services.
Everything else comes from `/previews/music-search/`.

## Sample data

`generate-sample-library.mjs` (Node, no dependencies) writes 12 MP3 files (156 KB in total) in nested
folders to `public/previews/music-search/sample-music/`, plus `sample-music.json` (the list of files
the page fetches). The list sits outside the folder so the program never walks it.

- Audio: valid MPEG-1 Layer III frames with all-zero side info and main data, which decode to
  0.6 to 0.9 s of digital silence. Chrome's `decodeAudioData` decodes every file (checked by the QA
  script). The files mix 32/44.1/48 kHz, 32 to 320 kbps, and stereo, joint-stereo and mono frames.
- Tags: real ID3v1.1 (128-byte `TAG`), ID3v2.3 (Latin-1 and UTF-16 text frames, `COMM`, `TRCK`) and
  one ID3v2.4 (UTF-8, year in `TDRC`). The mix covers ID3v1 only, ID3v2 only, both, and no tags.
  It shows ID3v1's 30-character truncation and UTF-16 names (Dvořák, Frédéric Chopin, Für Elise).
- Metadata is clearly sample data: public-domain classical works and composers, album
  "Sample Library - Baroque/Classical/Romantic", comment "Sample file: silent audio". The years are
  composition or publication years. No real audio, recordings or lyrics.
- File names are ASCII and sorted so that CheerpJ's virtual disk and Windows (NTFS) list them in the
  same order.

Quirks you will see, all from the original code and mp3agic 0.9.1 (the native run prints them too):
`Year: null` for the ID3v2.4 file (mp3agic reads `TYER` only), "1 seconds", and the
"Other Properties" block printed straight after the file's last tag block.

## Rebuild

Requires a JDK 21+ on PATH (built with Temurin 25.0.2) and Node 20+. No Maven.

```powershell
node previews-src/music-search/generate-sample-library.mjs   # sample-music/ + sample-music.json
node previews-src/music-search/build.mjs                     # jars in public/previews/music-search/java/ + source.json
```

`build.mjs` caches the mp3agic jar in `previews-src/music-search/build/` (git-ignored). It verifies
the SHA-1 and writes jars with a fixed timestamp (`jar --date`), so rebuilds are byte-identical.
`cheerpj-preload.json` is CheerpJ's `cjGetRuntimeResources()` profile for this app (documented
preloading workflow). It was regenerated with `python qa/previews/music-search-test.py --profile-preload`.
If it is missing, the page still works.

## Test

```powershell
node scripts/dev-server.mjs --root public --port 4440   # or: npx serve public -l 4440 (needs HTTP Range support)
$env:PYTHONIOENCODING = "utf-8"
python qa/previews/music-search-test.py
```

The script uses headless Chrome with a temporary profile only, plus Python Playwright. It:

- runs the original program **natively** (`java -cp music-app-1.0-SNAPSHOT.jar;mp3agic-0.9.1.jar
  controller.MetadataExtractor`, stdin `sample-music`, `-Dstdout.encoding=UTF-8`) and saves
  `qa/previews/music-search-native-output.txt`;
- runs it **in the browser** on `/files/sample-music` and saves `music-search-browser-output.txt`.
  The two stdout streams are **identical** after mapping `/files/sample-music` ↔ `sample-music`,
  `\` → `/`, and CRLF → LF (Windows path separators and line endings). stderr is empty in both;
- also checks: the same `Error reading directory: …` text for a missing folder, Run again from the
  keyboard, picked files (including the left-out non-MP3), that every sample MP3 decodes, the
  `portfolio:theme` message (directly and from a parent page into a same-origin iframe), no
  horizontal scroll at 360/390/1400 px, keyboard reach of every control, the source tabs, and a
  clear error state when the CDN is blocked;
- writes `qa/previews/music-search-report.json` and the screenshots
  `music-search-{1280x800,1280x800-end,390x720,360x560,light-1280x800,loading,panels-1280x800,cdn-blocked,in-iframe}.png`.

## Timings (local server, this machine, headless Chrome 2026-11-04)

"First usable" means the program's prompt is on screen and stdin accepts input, measured from
navigation start (`window.__musicSearch.metrics.readyMs`).

| | First usable | Notes |
|---|---|---|
| Cold (new profile, empty cache) | **2.1 to 3.3 s** over 8 runs (latest 2.1 s) | about 0.15 s to first paint; the JVM boots and downloads its runtime in about 1.8 s. The very first prototype load of the day (before preloading was added, CDN possibly cold) took 5.7 s. |
| Warm (reload, same profile) | **1.1 to 1.5 s** (median about 1.25 s over 18 reloads) | first paint about 20 ms |
| Scan of the 12-file sample library | about 0.5 s | click to "exited" |
| Two picked 3.8 MB (4 min) MP3s | about 1.0 s | copy to the virtual disk + scan |

## Payload

- Ours (`public/previews/music-search/`, about 280 KB in total): HTML/CSS/JS 33 KB, jars 81 KB
  (mp3agic 71 KB), sample MP3s 156 KB, JSON 8.5 KB, licence notices 3 KB. CheerpJ reads the jars in
  HTTP Range chunks; a cold session transferred about 274 KB from this origin.
- CheerpJ CDN, cold visit: **about 8 to 12 MB** over about 30 requests. Of that, `cj3n21.wasm` is
  1.2 MB, `cj3.js` + `cj3.wasm` are 0.4 MB, and the rest is Java 21 class-library ranges. It is
  cached by the browser afterwards (a warm start re-downloads nothing large). On a slow connection
  this download dominates the cold start.

## Known limitations

- Needs the CheerpJ CDN: offline, or with the CDN blocked, the page shows "The Java runtime could
  not start" with a retry button and the source panel still works. A paid licence would be needed
  to self-host the runtime.
- Paths are virtual (`/files/…`), not the visitor's real disk. Typing `/` or `/files` also works and
  shows CheerpJ's own folders (`/app`, `/files/uploads`, `/files/downloads`).
- Picked files are written to the CheerpJ virtual disk (IndexedDB for this origin). They stay in
  this browser until the next pick or the next page load, which deletes them.
- *Add a folder…* uses `webkitdirectory` (desktop Chrome, Edge, Firefox and Safari; not iOS
  Safari). *Add MP3 files…* works everywhere.
- Automated checks ran in headless Chrome only; Firefox and Safari were not tested here (CheerpJ
  supports both).
