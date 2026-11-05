// Builds the Java side of the Music Search App preview (no Maven needed).
//
//   1. Downloads mp3agic 0.9.1 (the exact version in the original pom.xml) from Maven Central and
//      verifies its published SHA-1.
//   2. Compiles the ORIGINAL sources (original/src/main/java, unmodified) with javac --release 21
//      (the newest non-preview Java that CheerpJ 5.0 runs; the pom targets 23, the code needs 9+).
//   3. Compiles the browser launcher (adapter/web/BrowserConsole.java) separately.
//   4. Writes the jars + a JSON copy of the original sources to public/previews/music-search/.
//
// Usage: node previews-src/music-search/build.mjs        (requires a JDK 21+ on PATH)

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, "build"); // git-ignored
const out = resolve(here, "../../public/previews/music-search");
const javaOut = join(out, "java");
const RELEASE = "21";
const MP3AGIC = "mp3agic-0.9.1.jar";
const MP3AGIC_URL = "https://repo1.maven.org/maven2/com/mpatric/mp3agic/0.9.1/" + MP3AGIC;
// Fixed timestamp (the original repo's initial commit) so rebuilt jars are byte-identical.
const JAR_DATE = "2024-12-27T04:44:51Z";

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status ?? r.error})`);
}

function javaFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".java"))
    .map((e) => join(e.parentPath ?? e.path, e.name))
    .sort();
}

async function fetchMp3agic() {
  const lib = join(build, "lib");
  const jar = join(lib, MP3AGIC);
  const expected = (await (await fetch(MP3AGIC_URL + ".sha1")).text()).trim().slice(0, 40);
  if (!existsSync(jar) || sha1(readFileSync(jar)) !== expected) {
    mkdirSync(lib, { recursive: true });
    const res = await fetch(MP3AGIC_URL);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    writeFileSync(jar, Buffer.from(await res.arrayBuffer()));
  }
  const actual = sha1(readFileSync(jar));
  if (actual !== expected) throw new Error(`SHA-1 mismatch for ${MP3AGIC}: ${actual} != ${expected}`);
  console.log(`${MP3AGIC} sha1 ${actual} (matches Maven Central)`);
  return jar;
}

function sha1(buf) {
  return createHash("sha1").update(buf).digest("hex");
}

const mp3agic = await fetchMp3agic();
const originalSrc = join(here, "original", "src", "main", "java");
const adapterSrc = join(here, "adapter");
const classesOriginal = join(build, "classes", "original");
const classesAdapter = join(build, "classes", "adapter");
rmSync(join(build, "classes"), { recursive: true, force: true });
mkdirSync(javaOut, { recursive: true });

run("javac", ["--release", RELEASE, "-encoding", "UTF-8", "-cp", mp3agic, "-d", classesOriginal, ...javaFiles(originalSrc)]);
// Maven's default artifact name for <artifactId>music-app</artifactId> <version>1.0-SNAPSHOT</version>
run("jar", ["--create", "--date", JAR_DATE, "--file", join(javaOut, "music-app-1.0-SNAPSHOT.jar"), "-C", classesOriginal, "."]);

run("javac", ["--release", RELEASE, "-encoding", "UTF-8", "-cp", classesOriginal, "-d", classesAdapter, ...javaFiles(adapterSrc)]);
run("jar", ["--create", "--date", JAR_DATE, "--file", join(javaOut, "browser-console.jar"), "-C", classesAdapter, "."]);

copyFileSync(mp3agic, join(javaOut, MP3AGIC));

// Original sources for the in-page "View source" panel.
const sources = javaFiles(originalSrc).map((f) => ({
  path: "src/main/java/" + relative(originalSrc, f).split("\\").join("/"),
  text: readFileSync(f, "utf8").replace(/\r\n/g, "\n"),
}));
sources.push({ path: "pom.xml", text: readFileSync(join(here, "original", "pom.xml"), "utf8").replace(/\r\n/g, "\n") });
writeFileSync(join(out, "source.json"), JSON.stringify({ files: sources }, null, 1) + "\n");

for (const f of readdirSync(javaOut)) console.log(`  java/${f}  ${readFileSync(join(javaOut, f)).length} B`);
console.log("Build complete.");
