// Vercel function: Library Relational Database API (Colby Baker, July 2022), running live.
//
// The ORIGINAL Express app (api/_library/index.cjs: routes, handlers, knex queries unchanged) is
// mounted under /api/library behind a small safety wrapper. Its database is PGlite (real
// PostgreSQL compiled to WASM, in memory) created on cold start by running the ORIGINAL knex
// migrations, then the disclosed preview schema shim (see api/_library/preview-schema-shim.cjs).
// Details: previews-src/library/PREVIEW.md
import express from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalApp = require('./_library/index.cjs');
const db = require('./_library/db.cjs');
const schemaShim = require('./_library/preview-schema-shim.cjs');

const BASE = '/api/library';
// Sandbox data goes back to the migration seed every 30 minutes (env override only for local reset tests).
const RESET_MS = Number(process.env.LIBRARY_PREVIEW_RESET_MS) || 30 * 60 * 1000;
const BODY_LIMIT = '10kb';
const MAX_STRING = 200; // max length of any string value in a JSON body
const MAX_PATH = 300; // max length of the request path
const WRITE_LIMIT = 20; // POST/PUT/DELETE requests per IP per window
const WRITE_WINDOW_MS = 60 * 1000;

// ---- database lifecycle: lazy init once per instance, reset on a timer --------------------
let ready = null;
let nextResetAt = 0;

async function rebuildDatabase() {
    await db.raw('DROP SCHEMA IF EXISTS public CASCADE');
    await db.raw('CREATE SCHEMA public');
    await db.migrate.latest(); // the ORIGINAL 2022 migrations (tables + seed data)
    await schemaShim.up(db);
}

function ensureDatabase() {
    const now = Date.now();
    if (ready && now < nextResetAt) return ready;
    nextResetAt = now + RESET_MS;
    ready = rebuildDatabase().catch((err) => {
        ready = null;
        nextResetAt = 0;
        throw err;
    });
    return ready;
}

// ---- helpers ---------------------------------------------------------------------------------
function clientIp(req) {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real) return real.trim();
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

const writeHits = new Map(); // ip -> { count, windowStart }
function overWriteLimit(ip) {
    const now = Date.now();
    if (writeHits.size > 5000) {
        for (const [key, v] of writeHits) if (now - v.windowStart > WRITE_WINDOW_MS) writeHits.delete(key);
    }
    let entry = writeHits.get(ip);
    if (!entry || now - entry.windowStart > WRITE_WINDOW_MS) {
        entry = { count: 0, windowStart: now };
        writeHits.set(ip, entry);
    }
    entry.count += 1;
    return entry.count > WRITE_LIMIT ? Math.ceil((entry.windowStart + WRITE_WINDOW_MS - now) / 1000) : 0;
}

function findLongString(value, path = 'body', depth = 0) {
    if (depth > 8) return path;
    if (typeof value === 'string') return value.length > MAX_STRING ? path : null;
    if (Array.isArray(value)) {
        if (value.length > 100) return path;
        for (let i = 0; i < value.length; i++) {
            const hit = findLongString(value[i], `${path}[${i}]`, depth + 1);
            if (hit) return hit;
        }
    } else if (value && typeof value === 'object') {
        for (const [key, v] of Object.entries(value)) {
            if (key.length > MAX_STRING) return `${path}.<key>`;
            const hit = findLongString(v, `${path}.${key}`, depth + 1);
            if (hit) return hit;
        }
    }
    return null;
}

function sendJsonError(res, status, body) {
    if (res.headersSent) return;
    res.status(status).set('Cache-Control', 'no-store').json(body);
}

// ---- the wrapper app -------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');

// Bare /api/library -> /api/library/ (keeps relative links predictable).
app.get(BASE, (req, res, next) => {
    if (req.path !== BASE) return next();
    return res.redirect(308, `${BASE}/`);
});

app.use(BASE, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.originalUrl.split('?')[0].length > MAX_PATH) {
        return sendJsonError(res, 414, { error: 'Request path too long' });
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const retry = overWriteLimit(clientIp(req));
        if (retry) {
            res.set('Retry-After', String(retry));
            return sendJsonError(res, 429, {
                error: `Too many write requests: limit is ${WRITE_LIMIT} per minute per visitor. Try again in ${retry} s.`,
            });
        }
    }
    return next();
});

app.use(BASE, express.json({ limit: BODY_LIMIT })); // runs before the original express.json()

app.use(BASE, (req, res, next) => {
    const hit = req.body && typeof req.body === 'object' ? findLongString(req.body) : null;
    if (hit) {
        return sendJsonError(res, 400, { error: `String too long at ${hit} (max ${MAX_STRING} characters)` });
    }
    return next();
});

app.use(BASE, (req, res, next) => {
    ensureDatabase().then(() => {
        res.set('X-Sandbox-Reset-At', new Date(nextResetAt).toISOString());
        next();
    }, next);
});

app.use(BASE, originalApp); // the ORIGINAL 2022 routes

// Unknown paths: JSON 404 instead of Express' HTML page.
app.use(BASE, (req, res) => {
    sendJsonError(res, 404, { error: 'Not found', routes: '/previews/library/ lists every route' });
});

// Errors: JSON, never a stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return sendJsonError(res, 413, { error: `Request body too large (limit ${BODY_LIMIT})` });
    }
    if (err && err.type === 'entity.parse.failed') {
        return sendJsonError(res, 400, { error: 'Malformed JSON body' });
    }
    if (err && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
        // PostgreSQL error raised by an original query: same 500 status as the original app,
        // plus the database message (no SQL text, no stack) so the sandbox is understandable.
        let detail = String(err.message || '');
        const sep = detail.lastIndexOf(' - ');
        if (sep > -1 && /^(select|insert|update|delete|with)\b/i.test(detail)) detail = detail.slice(sep + 3);
        return sendJsonError(res, 500, {
            error: 'Internal Server Error',
            database: { code: err.code, message: detail.slice(0, 300) },
        });
    }
    console.error('[library preview] unexpected error:', err && err.message);
    return sendJsonError(res, 500, { error: 'Internal Server Error' });
});

export default function handler(req, res) {
    return app(req, res);
}
