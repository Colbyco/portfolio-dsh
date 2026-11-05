# Weather Database Website (August 2021) — live preview

**Stage URL:** `/api/weather/` (also reachable via `/previews/weather/`, a tiny page that forwards to it
with `location.replace` + meta refresh).

The original Express + EJS + knex/PostgreSQL app runs live in a Vercel Node function
(`api/weather.js`). A visitor types a city, the server fetches current weather, stores it in
PostgreSQL and re-renders the table of lookups from the last hour, exactly like the 2021 app.

## Original vs. adapted

Source: `colby-portfolio-dsh-sources/weather-database-website` (read-only reference).

| Original file | Preview file | Change |
|---|---|---|
| `weather-api-website.js` | `api/_weather/weather-api-website.cjs` | Routes, OpenWeatherMap URL, record mapping unchanged. Removed `dotenv`; `require('axios')` → `require('./openweather-compat.cjs')`; `.cjs` require paths; added `app.set('views', __dirname + '/views')` (the original relied on the working directory); `app.listen()` → `module.exports = app`. Each change is marked `PREVIEW:` in the file. |
| `weather-repository.js` | `api/_weather/weather-repository.cjs` | Unchanged except `./db` → `./db.cjs`. |
| `db.js` | `api/_weather/db.cjs` | Unchanged except `./knexfile.js` → `./knexfile.cjs`. |
| `knexfile.js` | `api/_weather/knexfile.cjs` | `client: 'pg'` + `DATABASE_URL` → `knex-pglite` (in-memory PGlite = real PostgreSQL in WASM). `searchPath` kept. Explicit migration source. |
| `migrations/*.js` | `api/_weather/migrations/*.cjs` | Byte-identical content (renamed). Listed in `migration-source.cjs` with static requires so file tracing bundles them; knex records the original file names. |
| `views/index.ejs` | `api/_weather/views/index.ejs` | 3 markup changes, see below. |
| `public/css/main.css` | `api/_weather/public/css/main.css` | Byte-identical, served by the original `app.use('/css', express.static(...))` route at `/api/weather/css/main.css`. |
| `package.json` deps | root deps | express 4, ejs 3, axios 1, knex 3 (root versions); `pg`, `dotenv`, `nodemon` not needed. |

Preview-only files: `api/weather.js` (safety wrapper + lifecycle), `api/_weather/openweather-compat.cjs`,
`request-context.cjs`, `seed.cjs`, `seed-observations.json`, `public/previews/weather/preview.css`,
`public/previews/weather/vendor/bootstrap-5.0.2/` (Bootstrap's MIT `LICENSE` included).

### View markup changes (`index.ejs`)
1. Bootstrap link: `https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css` →
   `/previews/weather/vendor/bootstrap-5.0.2/bootstrap.min.css`. Same version, same file: the original
   `integrity="sha384-EVSTQN3/…"` attribute is kept and matches (verified), so no third-party request.
2. Added `<link rel="stylesheet" href="/previews/weather/preview.css">` after Bootstrap. It styles the
   note and, below 900/760 px, widens the 20%-wide form and makes the 9-column table scroll inside
   itself so the page never scrolls sideways at 360 px. Original `main.css` untouched.
3. Added one small disclosure note at the bottom (Open-Meteo instead of OpenWeatherMap, in-memory
   PostgreSQL resetting hourly, auto-fetched first rows, Open-Meteo attribution).

Everything else (copy including the "Humudity" header, the relative `css/main.css` link,
`action=""`, the stray `;` in `<table>`) is original. The relative paths work because the app is
always served at `/api/weather/` (a bare `/api/weather` is 308-redirected to the trailing slash).

## Weather data: OpenWeatherMap → Open-Meteo (keyless)

The original calls `api.openweathermap.org/data/2.5/weather?q=<city>&appid=<API_KEY>&units=imperial`,
which needs a private key. `openweather-compat.cjs` exposes the same `axios.get(url)`: for that URL it
geocodes `q` (Open-Meteo Geocoding API), fetches current conditions + today's range (Open-Meteo
Forecast API) and resolves with `{ status: 200, data }` in the OpenWeatherMap shape, so the original
mapping code is unchanged. Any other URL is passed to the real axios.

| OpenWeatherMap field read by the original | Open-Meteo source |
|---|---|
| `name` | geocoding `results[0].name` (`City, CC` / `City, State` qualifiers filter results) |
| `weather[0].main` | `current.weather_code` (WMO) → 0 Clear · 1–3 Clouds · 45/48 Fog · 51–57 Drizzle · 61–67, 80–82 Rain · 71–77, 85–86 Snow · 95–99 Thunderstorm |
| `main.temp` | `current.temperature_2m` |
| `main.feels_like` | `current.apparent_temperature` |
| `main.temp_min` / `main.temp_max` | `daily.temperature_2m_min[0]` / `daily.temperature_2m_max[0]` (today's local low/high; OpenWeatherMap's were a momentary spread across the city area, which Open-Meteo does not provide) |
| `main.pressure` | `current.pressure_msl` (hPa at sea level, like OpenWeatherMap's default) |
| `main.humidity` | `current.relative_humidity_2m` (%) |
| `units=imperial/metric/standard` | `temperature_unit=fahrenheit/celsius`, standard → kelvin |

Errors: unknown city rejects like OpenWeatherMap's 404 ("city not found"); network errors and
timeouts reject compactly. Every upstream call has a hard 3.5 s limit (`AbortSignal.timeout`, which
also covers the TCP connect phase that axios' own `timeout` does not).

Third-party requests (server-side only, the browser makes none):
`https://geocoding-api.open-meteo.com/v1/search` and `https://api.open-meteo.com/v1/forecast`.
Free, no key, non-commercial use, CC BY 4.0 attribution (shown in the note).

## Database
PGlite in memory, one per function instance. On the first request the wrapper awaits
`db.migrate.latest()` with the two ORIGINAL migrations (create `weather_data`, add `ts timestamptz`),
then the seed. Every 60 minutes (checked lazily on request) rows are deleted and the seed is
inserted again. The original listing query (`ts` within the last hour, 20 rows, newest first) is
unchanged.

## Seed data
The original starts empty and only lists rows from the last hour, so a fixture with true old
timestamps would never be visible. Instead (no timestamp is ever faked):
- **Live seed:** on cold start and at every reset, current conditions for the 4 fixture cities
  (Chicago, New York, London, Tokyo) are fetched in ONE Open-Meteo request (3 s limit) and inserted
  through the original repository with the original field mapping and their true fetch time.
- **Fallback:** if Open-Meteo is unreachable, the build-time observations in
  `api/_weather/seed-observations.json` are inserted with their TRUE capture timestamps
  (2026-11-05 00:58 UTC); the original one-hour query then hides them, i.e. the original empty state.
- The fixture was captured with `node previews-src/weather/capture-seed.mjs`, which sends the
  original request URL through the compat client and stores coordinates for the live refresh.

## Safety wrapper (`api/weather.js`, before the original routes)
- Form body: same `urlencoded({ extended: true })` parser, 2 KB limit (413 page beyond).
- `city_name`: control characters and `& # ? %` removed (the original pastes it into a URL query),
  whitespace collapsed, trimmed; empty → 400 page; more than 80 characters → 400 page.
- Rate limit: 15 POST lookups per minute per IP (`x-real-ip` / `x-forwarded-for`), in memory → 429
  page with `Retry-After`.
- Original route handlers are wrapped without editing them: a thrown error, a rejected promise, or a
  handler that finishes without responding (the original `.catch()` only `console.log`s, so an unknown
  city used to hang forever) gets a friendly error page: 404 city not found, 502 service unreachable,
  504 timeout, 500 otherwise. Never a stack trace. 9 s last-resort response timeout.
- Data reset to the seed every 60 minutes; unknown paths → 404 page.
- Dev only: if `TZ` is unset the function sets `TZ=UTC` (Vercel already runs in UTC), so "Time
  Searched … UTC" is true on local servers as it was on the original UTC host. In the shared local
  dev server this applies process-wide.

## Deployment
`vercel.json` needs PGlite's runtime assets, which file tracing misses (verified with `@vercel/nft`):
```json
"functions": {
  "api/weather.js": { "includeFiles": "node_modules/@electric-sql/pglite/dist/{pglite.wasm,pglite.data,initdb.wasm}" }
}
```
Everything under `api/_weather/` (views, CSS, fixture, migrations) and `ejs` is traced already.
Cold start ≈ 1 s (PGlite boot + migrations) + live seed (≈ 0.3–1 s); ≈ 340 MB RSS per instance.

## How to test
```powershell
node scripts/dev-server.mjs --root public --port 4410
node previews-src/weather/smoke-test.mjs          # 19 checks: routes, real lookup, errors, limits
python qa/previews/weather_library_screenshots.py  # qa/previews/weather-*.png (+ library)
python qa/previews/weather_library_keyboard.py
```
Reset/fallback tests: start the server with `$env:WEATHER_PREVIEW_RESET_MS='8000'` (fast reset) and/or
`$env:HTTPS_PROXY='http://127.0.0.1:9'` (Open-Meteo unreachable → fixture fallback, 502 page) or
`$env:HTTPS_PROXY='http://10.255.255.1:80'` (black hole → 3 s seed fallback, 504 page after 3.5 s).
Refresh the fixture: `node previews-src/weather/capture-seed.mjs`.

## Known limitations
- State is per function instance: concurrent instances show different rows; a cold start resets data.
- Rate limiting is per instance (in memory), not global.
- `temp_min`/`temp_max` are today's forecast range, not OpenWeatherMap's momentary spread; condition
  groups are coarser (no Mist/Haze/Smoke/Dust distinction).
- Open-Meteo geocoding matches city names, not OpenWeatherMap's exact query grammar.
