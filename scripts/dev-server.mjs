// Local server that mimics the Vercel deployment: static files + every api/<name>.js handler
// mounted at /api/<name>/... with the original URL preserved in req.url.
// Usage: node scripts/dev-server.mjs [--port 4401] [--root dist|public]
import express from "express";
import { readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const port = Number(arg("port", 4401));
const root = arg("root", "dist");

const app = express();
app.disable("x-powered-by");

const apiDir = join(projectRoot, "api");
let names = [];
try {
  names = readdirSync(apiDir).filter((f) => f.endsWith(".js") && !f.startsWith("_"));
} catch {}
for (const file of names) {
  const name = basename(file, ".js");
  const mod = await import(pathToFileURL(join(apiDir, file)).href);
  const handler = mod.default?.default ?? mod.default;
  app.use(`/api/${name}`, (req, res) => {
    req.url = req.originalUrl; // Vercel passes the original path to the function
    return handler(req, res);
  });
  console.log(`mounted /api/${name}/*`);
}

app.use(express.static(join(projectRoot, root), { extensions: ["html"] }));
if (root !== "public") app.use(express.static(join(projectRoot, "public"), { extensions: ["html"] }));
app.use((req, res) => res.status(404).send("Not found"));
app.listen(port, "127.0.0.1", () => console.log(`serving ${root}/ + api on http://127.0.0.1:${port}`));
