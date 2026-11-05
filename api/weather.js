// Vercel function: Weather Database Website (Colby Baker, August 2021), running live.
//
// The ORIGINAL Express app (api/_weather/weather-api-website.cjs: routes, OpenWeatherMap request,
// record mapping, EJS view) is mounted under /api/weather behind a small safety wrapper.
// Database: PGlite (real PostgreSQL compiled to WASM, in memory) created on cold start by the
// ORIGINAL knex migrations, then seeded (api/_weather/seed.cjs) and reset to the seed every hour.
// Weather: the original OpenWeatherMap call is answered by a keyless Open-Meteo compat client.
// Details: previews-src/weather/PREVIEW.md
import express from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The original rendered "Time Searched" with toLocaleString() + " UTC" on a UTC server (Heroku).
// Vercel functions run in UTC too; this only makes local dev servers match.
if (!process.env.TZ) process.env.TZ = 'UTC';

const ejs = require('ejs'); // static require so the template engine is bundled
const originalApp = require('./_weather/weather-api-website.cjs');
const db = require('./_weather/db.cjs');
const { seedObservations } = require('./_weather/seed.cjs');
const requestContext = require('./_weather/request-context.cjs');

originalApp.engine('ejs', ejs.__express); // same engine Express would load for 'view engine' ejs

const BASE = '/api/weather';
// Data goes back to the seed every 60 minutes (env override only for local reset tests).
const RESET_MS = Number(process.env.WEATHER_PREVIEW_RESET_MS) || 60 * 60 * 1000;
const MAX_CITY = 80;
const POST_LIMIT = 15; // lookups per IP per window
const POST_WINDOW_MS = 60 * 1000;
// Last-resort net for any request that never answers. Upstream calls are capped at 3.5 s each
// (geocode + forecast = 7 s worst case; seed 3 s), so this stays under a 10 s function limit.
const RESPONSE_TIMEOUT_MS = 9 * 1000;

// ---- database lifecycle: lazy init once per instance, reset on a timer --------------------
let ready = null;
let migrated = false;
let nextResetAt = 0;

async function rebuildData() {
    if (!migrated) {
        await db.migrate.latest(); // the ORIGINAL 2021 migrations
        migrated = true;
    } else {
        await db('weather_data').del();
    }
    await seedObservations();
}

function ensureDatabase() {
    const now = Date.now();
    if (ready && now < nextResetAt) return ready;
    nextResetAt = now + RESET_MS;
    ready = rebuildData().catch((err) => {
        ready = null;
        nextResetAt = 0;
        throw err;
    });
    return ready;
}

// ---- guard the original route handlers -----------------------------------------------------
// The original POST handler's .catch() only logs, so a failed lookup would leave the browser
// waiting forever, and the async GET handler has no error handling. Without touching that code,
// each original route handler is wrapped: a thrown error or rejected promise goes to the error
// page, and a returned promise that settles without a response gets the friendly error page.
class UnansweredError extends Error {}
function guardOriginalRoutes(app) {
    for (const layer of app._router.stack) {
        if (!layer.route) continue;
        for (const routeLayer of layer.route.stack) {
            const handle = routeLayer.handle;
            if (handle.length > 3) continue;
            routeLayer.handle = function guardedHandler(req, res, next) {
                const ctx = requestContext.getStore();
                let ret;
                try {
                    ret = handle.call(this, req, res, next);
                } catch (err) {
                    return next(err);
                }
                if (ret && typeof ret.then === 'function') {
                    ret.then(
                        () => setImmediate(() => {
                            if (!res.headersSent) {
                                const err = new UnansweredError('original handler finished without a response');
                                err.upstream = ctx && ctx.upstreamError;
                                next(err);
                            }
                        }),
                        (err) => { if (!res.headersSent) next(err); },
                    );
                }
                return ret;
            };
        }
    }
}
guardOriginalRoutes(originalApp);

// ---- helpers ---------------------------------------------------------------------------------
function clientIp(req) {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real) return real.trim();
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

const postHits = new Map(); // ip -> { count, windowStart }
function overPostLimit(ip) {
    const now = Date.now();
    if (postHits.size > 5000) {
        for (const [key, v] of postHits) if (now - v.windowStart > POST_WINDOW_MS) postHits.delete(key);
    }
    let entry = postHits.get(ip);
    if (!entry || now - entry.windowStart > POST_WINDOW_MS) {
        entry = { count: 0, windowStart: now };
        postHits.set(ip, entry);
    }
    entry.count += 1;
    return entry.count > POST_LIMIT ? Math.ceil((entry.windowStart + POST_WINDOW_MS - now) / 1000) : 0;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function sendErrorPage(res, status, message) {
    if (res.headersSent) return;
    res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Weather Demo</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="${BASE}/css/main.css">
    <link rel="stylesheet" href="/previews/weather/vendor/bootstrap-5.0.2/bootstrap.min.css">
    <link rel="stylesheet" href="/previews/weather/preview.css">
</head>
<body>
    <main class="preview-error">
        <h1 class="h5">Weather lookup did not work</h1>
        <p>${escapeHtml(message)}</p>
        <a class="button btn-primary" href="${BASE}/">Back to the weather table</a>
    </main>
</body>
</html>`);
}

function messageForUpstream(upstream) {
    if (!upstream) return { status: 500, message: 'Something went wrong. Please try again.' };
    if (upstream.kind === 'not_found') return { status: 404, message: `No city named "${String(upstream.city || '').slice(0, MAX_CITY)}" was found.` };
    if (upstream.kind === 'bad_request') return { status: 400, message: 'Please enter a city name.' };
    if (upstream.kind === 'timeout') return { status: 504, message: 'The weather service did not respond in time. Please try again in a moment.' };
    return { status: 502, message: 'The weather service could not be reached. Please try again in a moment.' };
}

// ---- the wrapper app -------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');

// Bare /api/weather -> /api/weather/ so the original relative "css/main.css" and form action resolve.
app.use(BASE, (req, res, next) => {
    if (req.originalUrl.split('?')[0] === BASE) {
        const query = req.originalUrl.slice(BASE.length);
        return res.redirect(308, `${BASE}/${query}`);
    }
    return next();
});

app.use(BASE, (req, res, next) => {
    if (req.originalUrl.length > 300) return sendErrorPage(res, 414, 'That address is too long.');
    const timer = setTimeout(() => sendErrorPage(res, 504, 'The request took too long. Please try again.'), RESPONSE_TIMEOUT_MS);
    timer.unref?.();
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    return next();
});

// Same parser options as the original (extended: true); runs first, so the original's own
// express.urlencoded() sees an already-parsed body and skips.
app.use(BASE, express.urlencoded({ extended: true, limit: '2kb' }));

app.use(BASE, (req, res, next) => {
    if (req.method !== 'POST') return next();
    const retry = overPostLimit(clientIp(req));
    if (retry) {
        res.set('Retry-After', String(retry));
        return sendErrorPage(res, 429, `Too many lookups from your connection (limit ${POST_LIMIT} per minute). Please wait ${retry} seconds and try again.`);
    }
    let city = req.body && typeof req.body.city_name === 'string' ? req.body.city_name : '';
    city = city
        .replace(/[\u0000-\u001f\u007f]/g, ' ') // control characters
        .replace(/[&#?%]/g, ' ') // the original pastes the name into a URL query string
        .replace(/\s+/g, ' ')
        .trim();
    if (!city) return sendErrorPage(res, 400, 'Please enter a city name.');
    if (city.length > MAX_CITY) return sendErrorPage(res, 400, `City names are limited to ${MAX_CITY} characters.`);
    req.body = { city_name: city };
    return next();
});

app.use(BASE, (req, res, next) => {
    ensureDatabase().then(() => next(), next);
});

app.use(BASE, (req, res, next) => {
    requestContext.run({}, () => next());
});

app.use(BASE, originalApp); // the ORIGINAL 2021 app

app.use(BASE, (req, res) => sendErrorPage(res, 404, 'This page does not exist.'));

// Errors: friendly page, never a stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return sendErrorPage(res, 413, 'That request is too large.');
    if (err && err.type === 'entity.parse.failed') return sendErrorPage(res, 400, 'That request could not be read.');
    if (err instanceof UnansweredError) {
        const { status, message } = messageForUpstream(err.upstream);
        return sendErrorPage(res, status, message);
    }
    console.error('[weather preview] unexpected error:', err && err.message);
    return sendErrorPage(res, 500, 'Something went wrong. Please try again.');
});

export default function handler(req, res) {
    return app(req, res);
}
