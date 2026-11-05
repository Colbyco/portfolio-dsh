# Preview integration contract

The portfolio shell (Astro, `src/`) shows one project at a time in a centered **stage**: an
`<iframe>` inside a browser-style frame. Every project ships a preview that runs inside that
iframe. This file is the contract between the shell and the preview builders.

## Folders (each builder owns only its own paths)

| Path | Owner | Purpose |
|---|---|---|
| `previews-src/<slug>/` | preview builder | Build tooling and adapted source for the preview (own `package.json` allowed; its `node_modules` is git-ignored). |
| `public/previews/<slug>/` | preview builder | **Built, static output** served at `/previews/<slug>/`. Must contain `index.html`. Commit it. |
| `api/<slug>.js` (+ `api/_<slug>/**`) | preview builder (server previews only) | Vercel Node function. Default export: a Node `(req, res)` handler (an Express app is fine). It must handle every path under `/api/<slug>/...` (Vercel rewrites `/api/<slug>/(.*)` to this file; the original URL path is preserved in `req.url`). |
| `previews-src/<slug>/PREVIEW.md` | preview builder | What is original, what was adapted and why, how to rebuild, how to test. |
| Everything else (`src/`, root `package.json`, `vercel.json`, `scripts/`) | shell owner | Do not edit. Ask the shell owner for root dependencies (list them in your final report). |

Root dependencies already installed for server previews: `express@4`, `ejs@3`, `body-parser@1`,
`axios@1`, `knex@3`, `knex-pglite`, `@electric-sql/pglite`. Function code may import these.

## Preview requirements

1. **Embeddable**: loads in an iframe at `/previews/<slug>/` (same origin as the shell). Use only
   **relative** asset paths or absolute paths under `/previews/<slug>/`. No `X-Frame-Options`.
2. **Faithful**: keep the original project's UI, copy, and behavior. Adapt only what is needed to
   run it today (e.g. a retired API, a server-only database). Every adaptation is listed in
   `PREVIEW.md` and, when user-visible, disclosed by a small unobtrusive note inside the preview.
3. **Self-contained**: no API keys, no paid services, no secrets. Prefer zero third-party network
   requests; any that remain (e.g. a keyless public API) are listed in `PREVIEW.md`.
4. **Fits the stage**: works from 360x560 up to 1400x900 CSS px; no horizontal page scroll at 360 px.
5. **Fast**: first paint under ~1.5 s on a warm local server; keep static payload small
   (images compressed; no unused frameworks).
6. **Accessible**: keyboard operable, visible focus, labelled controls, sufficient contrast for any
   UI you add (original UI is kept as-is unless it is broken).
7. **Safe for a shared public deployment** (server previews): validate and length-limit inputs in a
   wrapper middleware placed *before* the original routes, never change other visitors' experience
   for long (state resets on a timer or per instance), and never leak stack traces.

## Shell -> preview messages (optional)

The shell may `postMessage({ type: "portfolio:theme", theme: "light" | "dark" }, "*")` to the
iframe. Previews may ignore it.

## Local testing

Static previews: any static server over `public/` (e.g. `npx serve public -l <your port>`).
Server previews: `node scripts/dev-server.mjs --port <your port>` serves `public/` and mounts every
`api/*.js` handler at `/api/<name>/...` exactly like Vercel.

Ports: shell 4400/4401. Preview builders use only their assigned port. Never use port 9333 or any
Chrome user profile; headless browsers only, with a temporary profile.
