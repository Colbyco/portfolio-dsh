# Colby Baker · Portfolio

Every project I've built since 2021, playable in one page. Pick a project in the timeline and it
runs in the center stage: the real Aspicio site, older apps restored to run their original code,
and my roles at CVS Health with their measured impact.

**Live:** https://colbybaker.dev

| Project | Year | What runs in the stage |
|---|---|---|
| Summoner Spell Generator | 2021 | The original page, styles and script, served statically |
| Weather Database | 2021 | The original Express server code on a Vercel function, with Postgres compiled to WebAssembly (PGlite) and keyless Open-Meteo in place of OpenWeatherMap |
| OpenAI Chatbot | 2022 | The original Vue app (2022 lockfile build); the retired text-davinci-002 is replaced by gpt-3.5-turbo-0613 through a capped server-side proxy (`api/chatbot.js`), so anyone can chat |
| Library Relational Database API | 2022 | The original Express routes and Knex migrations on PGlite, driven from a new API console |
| ProShop course project | 2024 | A viewer for my pull request and commits on a shared course codebase |
| Music Search App | 2024 | The original Java classes running in the browser on CheerpJ |
| Aspicio | 2026 | The production site, embedded 1:1 |
| Spotify Classic Lyrics | 2026 | The desktop app's real interface with a simulated system bridge |

Each preview's adaptations are documented in `previews-src/<slug>/PREVIEW.md` and disclosed in the
page itself.

## Stack

Astro (static) with a small TypeScript client for the stage, hand-written CSS, self-hosted Inter.
Server previews are Vercel Node functions in `api/`. No trackers, no third-party fonts.

## Deploy

Pushes to `main` deploy to production automatically (Vercel Git integration). The chatbot proxy
needs the Vercel secret `OPENROUTER_CHATBOT_KEY` (a dedicated OpenRouter key with a monthly cap).

## Develop

```bash
npm install
npm run build
npm run serve          # http://127.0.0.1:4401 (static site + api/ functions, like Vercel)
```

`CONTRACT.md` describes how previews plug into the stage. `qa/` holds the screenshot, poster and
Lighthouse tooling used to verify the site.
