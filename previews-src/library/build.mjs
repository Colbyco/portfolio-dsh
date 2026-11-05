// Builds public/previews/library/index.html (single self-contained file, no framework, no CDN).
//   * Endpoints: read from the ORIGINAL Express app's router (api/_library/index.cjs) and paired
//     with the original "// METHOD - Entity - /path - description" comments in that file.
//   * Schema/ERD: the ORIGINAL migrations are run in a throwaway in-memory PGlite and the result is
//     introspected (information_schema). The preview schema shim is then applied and every column
//     or default it adds is flagged, so the ERD shows exactly what is original.
//   * src/index.html + src/app.css + src/app.js are inlined with the generated data.
// Usage (repo root): node previews-src/library/build.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const libDir = join(root, 'api', '_library');

// ---- endpoints --------------------------------------------------------------------------------
const originalApp = require(join(libDir, 'index.cjs'));
const source = readFileSync(join(libDir, 'index.cjs'), 'utf8').replace(/\r\n/g, '\n');
const comments = [];
const re = /\/\/ (GET|POST|PUT|DELETE) - (\w+) - (\S+) - ([^\n]+)\napp\.(get|post|put|delete)\(\s*'([^']+)'/g;
for (let m; (m = re.exec(source));) {
    comments.push({ method: m[5].toUpperCase(), path: m[6], entity: m[2], description: m[4].trim() });
}
const routes = [];
for (const layer of originalApp._router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
        const M = method.toUpperCase();
        const c = comments.find((x) => x.method === M && x.path === layer.route.path);
        if (!c) throw new Error(`no original comment found for ${M} ${layer.route.path}`);
        routes.push({ method: M, path: layer.route.path, entity: c.entity, description: c.description });
    }
}

// Request examples (valid against the sandbox; fields are the ones each original handler reads).
const examples = {
    'POST /author': { body: { authorName: 'Ursula K. Le Guin' } },
    'POST /book/': { body: { book_name: 'The Casual Vacancy', author_id: 1, published_date: '2012-09-27', owned: 3, on_hand: 2 } },
    'GET /authors': {},
    'GET /books': {},
    'GET /author/:authorId': { params: { authorId: '1' } },
    'GET /book/:bookId': { params: { bookId: '1' } },
    'PUT /author/:authorId': { params: { authorId: '1' }, body: { authorName: 'J. K. Rowling' } },
    'PUT /book/:bookId': { params: { bookId: '1' }, body: { owned: 2, on_hand: 1 } },
    'DELETE /book/:bookId': { params: { bookId: '7' } },
};
// What each original handler does with the request (from reading index.js / library.js).
const notes = {
    'POST /author': 'Reads req.body.authorName; returns the inserted row.',
    'POST /book/': 'Reads book_name, author_id, published_date, owned, on_hand from the body.',
    'GET /authors': 'Returns every author, or 404 when the table is empty.',
    'GET /books': 'Returns every book, or 404 when the table is empty.',
    'GET /author/:authorId': 'Returns [{ author_name }] or 404.',
    'GET /book/:bookId': 'Returns the matching book or 404.',
    'PUT /author/:authorId': 'Reads req.body.authorName; returns the updated row or 404.',
    'PUT /book/:bookId': 'Only the fields you send are updated; returns the row or 404.',
    'DELETE /book/:bookId': 'Returns the deleted row or 404.',
};
for (const r of routes) {
    const key = `${r.method} ${r.path}`;
    if (!examples[key]) throw new Error(`missing example for ${key}`);
    r.params = (r.path.match(/:(\w+)/g) || []).map((p) => p.slice(1));
    r.example = examples[key];
    r.note = notes[key];
    r.hasBody = r.method === 'POST' || r.method === 'PUT';
}

// ---- schema -------------------------------------------------------------------------------------
const db = require(join(libDir, 'db.cjs'));
const shim = require(join(libDir, 'preview-schema-shim.cjs'));

async function introspect() {
    const cols = (await db.raw(`
        select c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default, c.is_identity, c.ordinal_position
        from information_schema.columns c
        where c.table_schema = 'public' and c.table_name not like 'knex_%'
        order by c.table_name, c.ordinal_position`)).rows;
    const keys = (await db.raw(`
        select tc.table_name, tc.constraint_type, kcu.column_name, ccu.table_name as ref_table, ccu.column_name as ref_column
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
        left join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and tc.constraint_type = 'FOREIGN KEY'
        where tc.table_schema = 'public' and tc.constraint_type in ('PRIMARY KEY', 'FOREIGN KEY') and tc.table_name not like 'knex_%'`)).rows;
    const tables = {};
    for (const c of cols) {
        tables[c.table_name] ??= { name: c.table_name, columns: [], rows: 0 };
        tables[c.table_name].columns.push({
            name: c.column_name,
            type: c.data_type === 'integer' ? 'int' : c.data_type,
            nullable: c.is_nullable === 'YES',
            default: c.column_default ? c.column_default.replace(/::\w+( \w+)*$/, '') : null,
            identity: c.is_identity === 'YES',
        });
    }
    for (const k of keys) {
        const col = tables[k.table_name].columns.find((c) => c.name === k.column_name);
        if (k.constraint_type === 'PRIMARY KEY') col.pk = true;
        else col.fk = { table: k.ref_table, column: k.ref_column };
    }
    for (const t of Object.values(tables)) {
        t.rows = Number((await db.raw(`select count(*)::int as n from "${t.name}"`)).rows[0].n);
    }
    return tables;
}

await db.migrate.latest();
const original = await introspect();
const shimApplied = await shim.up(db);
const final = await introspect();
await db.destroy();

const order = ['author', 'book', 'inventory'];
const schema = order.filter((n) => final[n]).map((name) => {
    const t = final[name];
    return {
        name,
        rows: original[name].rows,
        columns: t.columns.map((c) => {
            const o = original[name].columns.find((x) => x.name === c.name);
            const out = { ...c };
            if (!o) { out.shim = 'column added by the preview schema shim'; out.shimKind = 'column'; }
            else if (c.identity && !o.identity) { out.shim = 'identity default added by the preview schema shim'; out.shimKind = 'identity'; }
            return out;
        }),
    };
});

const data = {
    base: '/api/library',
    resetMinutes: 30,
    shimEnabled: Boolean(shimApplied),
    routes,
    schema,
    migrations: (await require(join(libDir, 'migration-source.cjs')).getMigrations()),
};

// ---- assemble -------------------------------------------------------------------------------------
const src = (f) => readFileSync(join(here, 'src', f), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const html = src('index.html')
    .replace('/*@@CSS@@*/', () => src('app.css').trim())
    .replace('/*@@DATA@@*/', () => `window.LIBRARY_PREVIEW = ${json};`)
    .replace('/*@@JS@@*/', () => src('app.js').trim());
const outDir = join(root, 'public', 'previews', 'library');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
console.log(`routes: ${routes.map((r) => `${r.method} ${r.path}`).join(', ')}`);
console.log(`tables: ${schema.map((t) => `${t.name}(${t.columns.map((c) => c.name + (c.shim ? '*' : '')).join(', ')})`).join(' ')}`);
console.log(`wrote public/previews/library/index.html (${Buffer.byteLength(html)} bytes)`);
