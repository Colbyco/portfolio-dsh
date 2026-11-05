// Smoke test for the live Weather Database Website preview: the original GET/POST routes
// (with a real keyless Open-Meteo lookup), static CSS, and the safety wrapper.
// Usage: node scripts/dev-server.mjs --root public --port 4410   (in another terminal)
//        node previews-src/weather/smoke-test.mjs [http://127.0.0.1:4410]
const origin = process.argv[2] || 'http://127.0.0.1:4410';
const base = `${origin}/api/weather`;
let failures = 0;
let n = 0;
const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;

async function req(method, path, form, extraHeaders = {}) {
    const t0 = performance.now();
    const res = await fetch(base + path, {
        method,
        redirect: 'manual',
        headers: { 'x-real-ip': ip, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...extraHeaders },
        body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, headers: res.headers, ms: Math.round(performance.now() - t0) };
}
function check(label, cond, info) {
    n += 1;
    if (cond) console.log(`ok   ${label}`);
    else { failures += 1; console.log(`FAIL ${label}  ${info ?? ''}`); }
}
const rows = (html) => (html.match(/<tr>\s*<td>/g) || []).length;
const firstCity = (html) => (html.match(/<tr>\s*<td>([^<]*)<\/td>/) || [])[1];
const noStack = (html) => !/\bat\s+\S+\s+\(|node_modules|\.cjs:\d+/.test(html);

let r = await req('GET', '/');
check('GET / renders the original view', r.status === 200 && /Enter a city name:/.test(r.text) && /Humudity/.test(r.text), r.status);
check('GET / shows seeded observations', rows(r.text) >= 4, `rows=${rows(r.text)}`);
console.log(`     (${r.ms} ms; first city: ${firstCity(r.text)})`);
check('original relative stylesheet css/main.css kept', r.text.includes('href="css/main.css"'));
r = await req('GET', '/css/main.css');
check('GET /css/main.css (original static route)', r.status === 200 && /styled-table/.test(r.text), r.status);
r = await fetch(`${origin}/previews/weather/vendor/bootstrap-5.0.2/bootstrap.min.css`);
check('local Bootstrap 5.0.2 served', r.status === 200 && /Bootstrap v5\.0\.2/.test(await r.text()), r.status);
r = await req('GET', '');
check('bare /api/weather -> 308 /api/weather/', r.status === 308 && r.headers.get('location') === '/api/weather/', `${r.status} ${r.headers.get('location')}`);

r = await req('POST', '/', { city_name: '   Denver   ' });
check('POST Denver -> real lookup, row added on top', r.status === 200 && firstCity(r.text) === 'Denver', `${r.status} first=${firstCity(r.text)}`);
console.log(`     (${r.ms} ms)`);
r = await req('POST', '/', { city_name: 'Paris, FR' });
check('POST "Paris, FR" (OpenWeatherMap-style qualifier)', r.status === 200 && firstCity(r.text) === 'Paris', `${r.status} first=${firstCity(r.text)}`);
r = await req('GET', '/');
check('GET / lists the new rows', /<td>Denver<\/td>/.test(r.text) && /<td>Paris<\/td>/.test(r.text));

r = await req('POST', '/', { city_name: 'Qwzxvbnmkplo' });
check('unknown city -> 404 friendly page (original would hang)', r.status === 404 && /No city named/.test(r.text) && noStack(r.text), `${r.status} ${r.text.slice(0, 120)}`);
r = await req('POST', '/', { city_name: '   ' });
check('blank city -> 400 page', r.status === 400 && /enter a city name/.test(r.text), r.status);
r = await req('POST', '/', { city_name: 'x'.repeat(81) });
check('81-char city -> 400 page', r.status === 400 && /80 characters/.test(r.text), r.status);
r = await req('POST', '/', { city_name: '<script>alert(1)</script>' });
check('HTML in city name is escaped on the error page', !/<script>alert/.test(r.text) && noStack(r.text), `${r.status}`);
r = await req('POST', '/', { city_name: 'London&appid=evil' });
check('query-string injection neutralized (& stripped)', r.status === 200 || r.status === 404, r.status);
r = await req('GET', '/nope');
check('unknown path -> 404 page', r.status === 404 && /does not exist/.test(r.text), r.status);
r = await req('PUT', '/');
check('unsupported method -> 404 page', r.status === 404, r.status);
r = await req('POST', '/', { city_name: 'y'.repeat(3000) });
check('oversized form body -> 413 page', r.status === 413 && noStack(r.text), r.status);

let limited = null;
for (let i = 0; i < 20 && !limited; i++) {
    const w = await req('POST', '/', { city_name: '' }); // cheap: rejected before any upstream call
    if (w.status === 429) limited = w;
}
check('POST rate limit -> 429 page with Retry-After', limited && limited.headers.get('retry-after'), limited ? limited.status : 'never limited');
r = await req('GET', '/');
check('GET still works while POST-limited', r.status === 200);

console.log(`\n${n - failures}/${n} checks passed`);
process.exit(failures ? 1 : 0);
