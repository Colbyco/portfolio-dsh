// Builds the static preview of Random Summoner Spell Generator into public/previews/summoner/.
//
//   cd previews-src/summoner && npm install && npm run build
//
// The original app (original/, copied verbatim from the GitHub repo at commit 8f2887c) is an
// Express server. Instead of re-typing what it does, this script runs the ORIGINAL app.js with a
// tiny stand-in for express that records its routes and static mounts, then:
//   1. calls the recorded `GET /` handler and renders views/index.ejs with exactly the locals the
//      handler passes to res.render (EJS, same as Express would);
//   2. copies every directory app.js serves with express.static to the same URL path;
//   3. applies the few documented static-hosting fixes (see PREVIEW.md).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ejs from "ejs";
import { optimizePng } from "./png-optimize.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ORIGINAL = join(here, "original");
const OUT = resolve(here, "..", "..", "public", "previews", "summoner");
const BOOTSTRAP_CDN = "https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css";
const BOOTSTRAP_LOCAL = "vendor/bootstrap-5.0.2/bootstrap.min.css";

// --- 1. Run the original app.js against a recording stand-in for express -----------------------
function runOriginalApp() {
  const routes = { get: new Map(), post: new Map() }, mounts = [], settings = {};
  const app = {
    use(path, handler) { if (typeof path === "string" && handler?.staticRoot) mounts.push({ path, root: handler.staticRoot }); },
    set(key, value) { settings[key] = value; },
    get(path, handler) { routes.get.set(path, handler); },
    post(path, handler) { routes.post.set(path, handler); },
    listen() { /* static build: nothing listens */ },
  };
  const express = Object.assign(() => app, {
    urlencoded: () => ({ urlencoded: true }),
    static: (root) => ({ staticRoot: root }),
  });
  const chalk = new Proxy(() => "", { get: () => chalk, apply: () => "" });
  const fakeRequire = (name) => {
    if (name === "express") return express;
    if (name === "chalk") return chalk;
    throw new Error(`app.js required an unexpected module: ${name}`);
  };
  const file = join(ORIGINAL, "app.js");
  const run = vm.compileFunction(readFileSync(file, "utf8"), ["require", "module", "exports", "__dirname", "__filename", "process", "console"], { filename: file });
  const module = { exports: {} };
  run(fakeRequire, module, module.exports, ORIGINAL, file, { env: {} }, console);
  return { routes, mounts, settings };
}

function renderRoute(appInfo, method, path) {
  const handler = appInfo.routes[method].get(path);
  if (!handler) throw new Error(`app.js has no ${method.toUpperCase()} ${path}`);
  let rendered;
  handler({ method: method.toUpperCase(), url: path, body: {} }, { render: (view, locals) => { rendered = { view, locals }; } });
  if (!rendered) throw new Error(`${method.toUpperCase()} ${path} did not call res.render`);
  const engine = appInfo.settings["view engine"];
  if (engine !== "ejs") throw new Error(`unexpected view engine ${engine}`);
  // Express's default "views" setting is <cwd>/views; the app is started from its own folder.
  const template = join(ORIGINAL, "views", `${rendered.view}.${engine}`);
  return { ...rendered, template, html: ejs.render(readFileSync(template, "utf8"), rendered.locals ?? {}, { filename: template }) };
}

// The server-side spell logic, taken verbatim from app.js, so the page can re-roll the initial
// pair on every load exactly like `GET /` did on every request.
function serverSpellSource() {
  const source = readFileSync(join(ORIGINAL, "app.js"), "utf8").replace(/\r\n/g, "\n");
  const match = source.match(/let summonerSpellsArray[\s\S]*?(?=\napp\.get\()/);
  if (!match) throw new Error("could not find the spell functions in app.js");
  return match[0].trim();
}

function replaceOnce(html, from, to) {
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`expected exactly one occurrence of ${JSON.stringify(from)}, found ${count}`);
  return html.replace(from, () => to);
}

function copyTree(from, to, onFile) {
  for (const name of readdirSync(from)) {
    const source = join(from, name), target = join(to, name);
    if (statSync(source).isDirectory()) { copyTree(source, target, onFile); continue; }
    mkdirSync(dirname(target), { recursive: true });
    onFile ? onFile(source, target) : copyFileSync(source, target);
  }
}

// --- Build ------------------------------------------------------------------------------------
if (!OUT.endsWith(`${sep}public${sep}previews${sep}summoner`)) throw new Error(`refusing to clean ${OUT}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const appInfo = runOriginalApp();
const page = renderRoute(appInfo, "get", "/");
console.log(`GET / -> res.render(${JSON.stringify(page.view)}, ${JSON.stringify(page.locals)})`);

// 2. Static mounts from app.js, copied to the same URL paths (relative to the preview root).
const report = [];
for (const { path, root } of appInfo.mounts) {
  const target = join(OUT, path.replace(/^\//, ""));
  copyTree(root, target, (source, dest) => {
    const original = readFileSync(source);
    if (source.toLowerCase().endsWith(".png")) {
      const result = optimizePng(original);
      writeFileSync(dest, result.bytes);
      report.push({ file: relative(OUT, dest), before: original.length, after: result.bytes.length, note: result.reason });
    } else {
      writeFileSync(dest, original);
      report.push({ file: relative(OUT, dest), before: original.length, after: original.length, note: "verbatim" });
    }
  });
}

// 3. Bootstrap 5.0.2 CSS, vendored (same file jsDelivr serves; the template's SRI hash is kept
//    and checked here, so the browser verifies it is byte-identical to the original CDN file).
const bootstrapFile = join(here, "node_modules", "bootstrap", "dist", "css", "bootstrap.min.css");
const bootstrapVersion = JSON.parse(readFileSync(join(here, "node_modules", "bootstrap", "package.json"), "utf8")).version;
if (bootstrapVersion !== "5.0.2") throw new Error(`expected bootstrap 5.0.2, found ${bootstrapVersion}`);
const bootstrap = readFileSync(bootstrapFile);
const sri = `sha384-${createHash("sha384").update(bootstrap).digest("base64")}`;
if (!page.html.includes(`integrity="${sri}"`)) throw new Error(`vendored bootstrap does not match the template's SRI hash (${sri})`);
mkdirSync(join(OUT, dirname(BOOTSTRAP_LOCAL)), { recursive: true });
writeFileSync(join(OUT, BOOTSTRAP_LOCAL), bootstrap);
report.push({ file: BOOTSTRAP_LOCAL.replace(/\//g, sep), before: bootstrap.length, after: bootstrap.length, note: `bootstrap ${bootstrapVersion}, ${sri}` });

// 4. Static-hosting fixes to the rendered HTML (each asserted to apply exactly once).
let html = page.html;
html = replaceOnce(html, `href="${BOOTSTRAP_CDN}"`, `href="${BOOTSTRAP_LOCAL}"`);
html = replaceOnce(html, `<script src="/js/client.js"></script>`, [
  `<script>`,
  `      // Preview adaptation: the original server rendered a fresh random pair on every request`,
  `      // (GET / -> res.render('index', { spells: randomSpellGen() })). On static hosting the same`,
  `      // app.js code runs here once per page load and fills the same two images.`,
  `      (function () {`,
  ...serverSpellSource().split("\n").map((line) => (line.trim() ? `        ${line}` : "")),
  `        const spells = randomSpellGen();`,
  `        document.getElementById("spell-1").src = "Images/" + spells[0] + ".png";`,
  `        document.getElementById("spell-2").src = "Images/" + spells[1] + ".png";`,
  `      })();`,
  `    </script>`,
  `    <script src="js/client.js"></script>`,
  `    <script src="preview/keyboard.js"></script>`,
].join("\n"));
html = replaceOnce(html, `crossorigin="anonymous" />`, `crossorigin="anonymous" />\n    <link rel="stylesheet" href="preview/preview.css" />`);
writeFileSync(join(OUT, "index.html"), html);

for (const name of ["preview.css", "keyboard.js"]) {
  mkdirSync(join(OUT, "preview"), { recursive: true });
  copyFileSync(join(here, "preview", name), join(OUT, "preview", name));
}

// Summary
const listFiles = (dir) => readdirSync(dir).flatMap((name) => statSync(join(dir, name)).isDirectory() ? listFiles(join(dir, name)) : [join(dir, name)]);
const files = listFiles(OUT).map((file) => ({ file: relative(OUT, file), size: statSync(file).size }));
const total = files.reduce((sum, f) => sum + f.size, 0);
const png = report.filter((r) => r.file.endsWith(".png"));
console.log(`spell PNGs: ${png.reduce((s, r) => s + r.before, 0)} -> ${png.reduce((s, r) => s + r.after, 0)} bytes (lossless)`);
for (const r of report) console.log(`  ${r.file.padEnd(46)} ${String(r.before).padStart(7)} -> ${String(r.after).padStart(7)}  ${r.note}`);
console.log(`output: ${files.length} files, ${total} bytes in ${relative(resolve(here, "..", ".."), OUT)}`);
