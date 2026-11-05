# Spotify lyrics fix (Classic Lyrics): portfolio preview

Stage URL: **`/previews/spotify-classic-lyrics/`** (static, built output in
`public/previews/spotify-classic-lyrics/`). The app window's own page is `app/index.html`.

## Original

- Electron desktop app for Windows and macOS. `package.json`: `spotify-classic-lyrics` /
  productName "Classic Lyrics", version **1.0.4**, MIT, author Colby Baker. The commits run from
  2026-10-21 to 2026-10-24, and the files in `original/src/` were copied from commit `7bd2c2c`.
- What it does (from `README.md` and `docs/details.md`): it sets one Spotify preference,
  `enableLyricsVariationsInNPV = "CONTROL"`, in Spotify's local settings database so that lyrics sit
  beside the library and playback controls again. **Undo** restores the previous value. The app can
  also run a startup check, offers a consent-gated **Report a problem** flow, and updates itself
  through GitHub on Windows. It has System/Dark/Light appearance.
- Window: `BrowserWindow` 440x365. The report screen resizes it to 460x690 (`main.cjs`). The README
  screenshots (`docs/images/*.png`) show the same content sizes.

## How the preview runs the real app

```
index.html (preview page: neutral backdrop, window frame, footnote)        shell/
 └─ <iframe> app/index.html  = original src/index.html (+ CSP), one line changed
      ├─ style.css            original, verbatim
      ├─ mock-bridge.js       generated simulated Electron runtime (build.mjs)
      │    ├─ ORIGINAL, unchanged: preload.cjs  -> window.classicLyrics { command, onStatus }
      │    │                       main.cjs, watcher.cjs, appearance.cjs, updates.cjs,
      │    │                       diagnostics.cjs, reporting.cjs (+ report-schema.mjs, imported)
      │    └─ SIMULATED: electron (main + renderer/IPC), electron-updater, node:fs/promises,
      │                  node:path, node:url, node:os, node:crypto, storage.cjs, platform.cjs,
      │                  reporting-config.json, fetch                                  sim/
      └─ renderer.js          original src/renderer.cjs, verbatim
```

`mock-bridge.js` loads first and provides the bridge. Instead of re-implementing the API by hand, it
runs the app's own `preload.cjs`, which defines `window.classicLyrics` with
`command(name, arg) -> ipcRenderer.invoke('command', ...)` and
`onStatus(cb) -> unsubscribe`. It also runs the app's own `main.cjs`, which registers the
`ipcMain.handle('command', ...)` switch, opens the window via `watcher.runAtStartup`, runs the startup
check, and starts the update check. The names, promise and event shapes, the state object (`kind`,
`message`, `canUndo`, `canReport`, `update`, …), the messages, and the error texts all come from the
original code. The simulation replaces only the layer below it: Electron, Node, the LevelDB settings
store, the OS process checks, and the network. A tiny CommonJS loader (`sim/runtime.js`) gives each
module its own simulated `require`, `process`, and `fetch`.

### Changes to the original files

| Original | Preview | Why |
|---|---|---|
| `src/index.html` | `app/index.html`: `<script src="renderer.cjs">` becomes `<script src="mock-bridge.js"></script><script src="renderer.js">` | load the bridge first (Electron loads `preload.cjs` before the page) |
| `src/renderer.cjs` | `app/renderer.js`, identical bytes | renamed only so every static host serves it with a JavaScript MIME type (`.cjs` is often `application/node`, which browsers can refuse) |
| `src/style.css`, `src/report-schema.mjs` | verbatim | |

`renderer.cjs` uses no CommonJS or Node features, so it needs no shim. The page keeps its original
Content-Security-Policy (`script-src 'self'`, `connect-src 'none'`, …), which also guarantees that
the preview cannot make network requests from the app page.

### The simulated computer (`sim/computer.cjs`, in memory, rebuilt on every page load)

Windows 11 x64 (`os.release()` 10.0.26100) running the installed Windows Setup build
(`app.isPackaged`, not portable). Spotify for Windows 1.3.6.1921 is installed for the user: that is
the version `docs/details.md` says the fix was verified against. Spotify is signed in, **closed**, and
has one profile whose `remote-config-overrides` record exists without the lyrics flag (shown as
`MISSING` in report details).

| Simulated module | Mirrors | Behaviour |
|---|---|---|
| `storage.cjs` | `src/storage.cjs` | Same exports and rules. Snapshot inspection; writing needs Spotify's lock (`LEVEL_LOCKED` while Spotify runs); exactly one flag is set; other overrides are preserved; a backup of the previous value goes to `%APPDATA%\Classic Lyrics\lyrics-backup.json` with the same record shape and key id; Undo restores and clears it, deleting a record the fix created if it is empty again |
| `platform.cjs` | `src/platform.cjs` | `locations()` verbatim (the build checks that it still matches); `discover`, `isSpotifyRunning` (tasklist), `stopSpotify` and `openSpotify` answered by the simulated computer |
| `electron-updater` | GitHub release feed | `checkForUpdates()` reports the latest stable version as the running one (1.0.4), so the original `updates.cjs` shows **Checking for updates… → Up to date** |
| `fetch` (reporting) | Supabase receiver | Answers the consent-gated upload in memory with the real receipt shape `{ id, accepted: true }`. The real endpoint and public key are not shipped |
| `dialog.showSaveDialog` | native Save dialog | Accepts the suggested `Documents\spotify-lyrics-report.json`; `fs.writeFile` writes to the in-memory disk |
| `nativeTheme` | OS theme | `themeSource` (set by the original `appearance.cjs`) drives the page's used `color-scheme`, so the original `light-dark()` colours switch exactly as in Electron. "System" follows the portfolio theme (below) |
| IPC | Electron IPC | Arguments and results are structured-cloned; errors are re-thrown as `Error invoking remote method 'command': Error: …` (the prefix `renderer.cjs` strips); `status` events are asynchronous |

Realistic delays: tasklist about 140 ms, profile discovery about 80 ms, snapshot inspection about
220 ms, database write about 200 ms, update check about 1.1 s, report upload about 0.9 s, save
dialog about 0.6 s. So **Working…**, **Sending…** and **Checking for updates…** are visible as in
the app.

Watcher and tray: `main.cjs` runs `runAtStartup` exactly as on a normal launch. It opens the window
and the tray, then runs one check. The startup repair branch needs `--background` with automatic
repair enabled, so it does not run, just as when a user opens the app. The tray menu is created, but
it has no UI in the window. The renderer listens only to `status` events, and those all come from the
original `emit()`.

## Preview frame (`shell/`)

- The window is shown at its native content size (440x365, or 460x690 for the report screen, as
  requested by `main.cjs` `setSize`). It is centered on a neutral backdrop under a plain
  Windows-style title bar (app icon, title, decorative non-interactive controls; the bar is dark when
  the app is dark). Below 488 px of width, the window fills the width and grows with its content,
  so there is no inner scrollbar. The page may scroll vertically when the report window (690 px) is
  taller than the stage.
- Theme: `postMessage({ type: "portfolio:theme", theme })` from the shell acts as the operating
  system theme. It recolours the backdrop and is forwarded to the app, where **Theme: System**
  follows it, while **Dark**/**Light** override it, exactly as in the app. Without a message, the
  browser's `prefers-color-scheme` is used.
- Disclosure (user-visible, under the window): "Simulated preview: runs the app's real interface;
  nothing on your computer is changed." After a simulated upload or save, the same line adds "Nothing
  was sent: the report upload is simulated." or "No file was saved: the save dialog is simulated."
  The footnote contrast is 7.4:1 in light mode and 9.3:1 in dark mode.

## Network and privacy

There are zero third-party requests. The only requests are for the 9 static files of the preview,
with no fetch or XHR. The app page's CSP keeps `connect-src 'none'`. Nothing is stored in the
browser (no localStorage or cookies), so reloading starts a fresh simulated computer. The report
screen's privacy text (Supabase, IP address) is the app's original copy; in the preview nothing
leaves the page.

## Rebuild

```sh
cd previews-src/spotify-classic-lyrics
node build.mjs        # no dependencies; -> public/previews/spotify-classic-lyrics/
```

## Test

```sh
node scripts/dev-server.mjs --root public --port 4420               # from the repo root
python previews-src/spotify-classic-lyrics/qa/test_preview.py
```

The test runs 114 checks in headless Chrome (temporary profile), and the latest run passed all of
them:

- **Bridge contract:** frozen `{ command, onStatus }`, a promise from `command`, an unsubscribe
  function from `onStatus`, the status shape, and the error prefix.
- **Main screen:** the startup sequence; Fix (Working… → Fixed); Check again; Theme
  Dark/Light/System, including portfolio messages and contrast; Check updates; the startup checkbox,
  with its message followed by the re-check; Undo, which restores the value and turns the startup
  repair off; keyboard focus and Enter.
- **Report screen:** opening it (window 460x690), the default finding, report details, consent
  gating, issue change clearing consent, Send (Sending… → Sent plus a receipt id), Save instead,
  Back (440x365), and the report after Undo (`MISSING`).
- **Layout and hygiene:** layout at 360/390/768/1400 px (centered or full width, no horizontal
  scroll, no inner scroll on narrow screens), no console errors or warnings, no failed or outside
  requests, and FCP well under 1.5 s.

Screenshots: `qa/previews/spotify-1280x800.png`, `spotify-1280x800-dark.png`,
`spotify-report-1280x800.png`, `spotify-390x720.png`, `spotify-report-390x720.png`,
`spotify-360x560.png`.

## Known limitations

- The simulated Spotify is always closed. The native "Spotify needs to close briefly" confirmation
  and the "Spotify is still using its settings" error path exist in the running `main.cjs` but are
  not shown. This avoids alarming visitors who have Spotify open, since nothing really closes.
- The update check is always "Up to date". The download and **Restart to update** path
  (`docs/images/update.png`) is not demonstrated.
- The Save dialog is auto-accepted. The window cannot be moved or resized, and its title-bar
  buttons are decorative. The `spotify`, `source` and `quit` commands exist in `main.cjs` but are
  not used by the window's interface and do nothing here.
- State is per page load, so the sign-in startup repair cannot be demonstrated across a "reboot".
- The preview simulates the Windows Setup build. macOS-only branches (Applications-folder check,
  no updater) are not exercised.
- The app page dynamically imports `report-schema.mjs`, so the host must serve `.mjs` as
  JavaScript (Express, `serve` and Vercel do). The preview must be same-origin with the shell, as
  the contract requires: an opaque-origin sandbox would block that module import and the
  frame-size measurement.
- Payload: 86 KB raw / about 32 KB gzip. `mock-bridge.js` is 57 KB raw / 17 KB gzip, and about half
  of it is the original main-process code.
