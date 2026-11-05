// Smoke test for the live Library API preview. Exercises every original route (reads, writes,
// 404s, database errors) and the safety wrapper (body/string limits, malformed JSON, rate limit).
// Usage: node scripts/dev-server.mjs --root public --port 4410   (in another terminal)
//        node previews-src/library/smoke-test.mjs [http://127.0.0.1:4410]
const origin = process.argv[2] || 'http://127.0.0.1:4410';
const base = `${origin}/api/library`;
let failures = 0;
let n = 0;
// Each run uses its own fake client IP so the write rate limit of earlier runs does not interfere.
const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;

async function call(method, path, body, { raw, headers = {} } = {}) {
    const t0 = performance.now();
    const res = await fetch(base + path, {
        method,
        redirect: 'manual',
        headers: { 'x-real-ip': ip, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, text, json, ms: Math.round(performance.now() - t0), headers: res.headers };
}

function check(label, cond, info) {
    n += 1;
    if (cond) console.log(`ok   ${label}`);
    else { failures += 1; console.log(`FAIL ${label}  ${info ?? ''}`); }
}

const short = (r) => `${r.status} ${r.text.slice(0, 160)}`;

let r = await call('GET', '/authors');
check('GET /authors -> seeded J.K. Rowling', r.status === 200 && r.json?.[0]?.author_name === 'J.K. Rowling', short(r));
console.log(`     (first request incl. cold-start migrations: ${r.ms} ms)`);
r = await call('GET', '/books');
check('GET /books -> 7 seeded books', r.status === 200 && r.json?.length >= 7, short(r));
r = await call('GET', '/author/1');
check('GET /author/1', r.status === 200 && r.json?.[0]?.author_name === 'J.K. Rowling', short(r));
r = await call('GET', '/author/999');
check('GET /author/999 -> 404', r.status === 404, short(r));
r = await call('GET', '/author/abc');
check('GET /author/abc -> 500 JSON db error 22P02, no stack', r.status === 500 && r.json?.database?.code === '22P02' && !/\bat\s+\S+\s+\(/.test(r.text), short(r));
r = await call('GET', '/book/3');
check('GET /book/3', r.status === 200 && /Azkaban/.test(r.json?.[0]?.book_name), short(r));
r = await call('GET', '/book/999');
check('GET /book/999 -> 404', r.status === 404, short(r));

r = await call('POST', '/author', { authorName: 'Ursula K. Le Guin' });
check('POST /author -> created with generated id', r.status === 200 && r.json?.[0]?.author_id >= 2, short(r));
const newAuthor = r.json?.[0]?.author_id;
r = await call('PUT', `/author/${newAuthor}`, { authorName: 'Ursula Kroeber Le Guin' });
check('PUT /author/:id -> updated', r.status === 200 && r.json?.[0]?.author_name === 'Ursula Kroeber Le Guin', short(r));
r = await call('PUT', '/author/999', { authorName: 'Nobody' });
check('PUT /author/999 -> 404', r.status === 404, short(r));
r = await call('POST', '/book/', { book_name: 'A Wizard of Earthsea', author_id: newAuthor, published_date: '1968-11-01', owned: 2, on_hand: 1 });
check('POST /book/ -> created', r.status === 200 && r.json?.[0]?.book_id >= 8 && r.json?.[0]?.owned === 2, short(r));
const newBook = r.json?.[0]?.book_id;
r = await call('POST', '/book/', { book_name: 'Orphan', author_id: 999, published_date: '2000-01-01' });
check('POST /book/ unknown author -> 500 JSON FK error 23503', r.status === 500 && r.json?.database?.code === '23503', short(r));
r = await call('PUT', `/book/${newBook}`, { on_hand: 0 });
check('PUT /book/:id -> updated', r.status === 200 && r.json?.[0]?.on_hand === 0, short(r));
r = await call('PUT', '/book/999', { book_name: 'Nothing' });
check('PUT /book/999 -> 404', r.status === 404, short(r));
r = await call('DELETE', `/book/${newBook}`);
check('DELETE /book/:id -> returns deleted row', r.status === 200 && r.json?.[0]?.book_id === newBook, short(r));
r = await call('DELETE', `/book/${newBook}`);
check('DELETE same book again -> 404', r.status === 404, short(r));

// Wrapper / safety
r = await call('POST', '/author', { authorName: 'x'.repeat(201) });
check('string > 200 chars -> 400', r.status === 400 && /too long/.test(r.json?.error), short(r));
r = await call('POST', '/author', JSON.stringify({ authorName: 'y'.repeat(150), pad: Array(80).fill('z'.repeat(150)) }), { raw: true });
check('body > 10kb -> 413', r.status === 413, short(r));
r = await call('POST', '/author', '{"authorName": ', { raw: true });
check('malformed JSON -> 400', r.status === 400 && /Malformed/.test(r.json?.error), short(r));
r = await call('GET', '/nope');
check('unknown route -> JSON 404', r.status === 404 && r.json?.error === 'Not found', short(r));
r = await call('GET', '');
check('bare /api/library -> 308 to /api/library/', r.status === 308 && r.headers.get('location') === '/api/library/', short(r));
check('X-Sandbox-Reset-At header present', !!(await call('GET', '/authors')).headers.get('x-sandbox-reset-at'));

let limited = null;
for (let i = 0; i < 25 && !limited; i++) {
    const w = await call('PUT', '/author/1', { authorName: 'J.K. Rowling' });
    if (w.status === 429) limited = w;
}
check('write rate limit -> 429 with Retry-After', limited && limited.headers.get('retry-after'), limited ? short(limited) : 'never limited');
r = await call('GET', '/authors');
check('reads still allowed while write-limited', r.status === 200, short(r));

console.log(`\n${n - failures}/${n} checks passed`);
process.exit(failures ? 1 : 0);
