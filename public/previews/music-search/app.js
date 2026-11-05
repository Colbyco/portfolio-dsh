// Music Search App preview: runs the ORIGINAL compiled Java program in the browser with CheerpJ.
//
// Java side (public/previews/music-search/java/):
//   music-app-1.0-SNAPSHOT.jar   the original classes (controller/model/util), unmodified source
//   mp3agic-0.9.1.jar            the dependency from the original pom.xml (Maven Central)
//   browser-console.jar          web.BrowserConsole: wires System.in/out/err to this page, then
//                                calls controller.MetadataExtractor.main
// This file only draws the terminal and feeds it: everything printed comes from the JVM.

const CHEERPJ_LOADER = "https://cjrtnc.leaningtech.com/5.0/loader.js"; // Community licence: CDN only
const JAVA_VERSION = 21;
const SAMPLE_DIR = "/files/sample-music";
const USER_DIR = "/files/your-mp3s";
const MAX_USER_FILES = 60;
const MAX_USER_BYTES = 150 * 1024 * 1024;

const here = new URL(".", location.href);
const vfs = "/app" + decodeURI(here.pathname); // CheerpJ's /app/ mount = this web server's root
const CLASSPATH = ["browser-console.jar", "music-app-1.0-SNAPSHOT.jar", "mp3agic-0.9.1.jar"]
  .map((jar) => vfs + "java/" + jar)
  .join(":");

const $ = (id) => document.getElementById(id);
const out = $("out");
const input = $("line");
const els = {
  pill: $("pill"), loading: $("loading"), loadingTitle: $("loading-title"), detail: $("loading-detail"),
  steps: $("steps"), retry: $("retry"), send: $("send"), sample: $("use-sample"), addFiles: $("add-files"),
  addFolder: $("add-folder"), clear: $("clear"), pickFiles: $("pick-files"),
  pickFolder: $("pick-folder"), live: $("live"), form: $("stdin"),
};

// Test / timing hooks (read by qa/previews/music-search-test.py).
const metrics = { t0: performance.timeOrigin, steps: {}, readyMs: null, runs: 0 };
window.__musicSearch = { metrics, stdout: () => textOf("o"), stderr: () => textOf("e"), state: () => state };

// ------------------------------------------------------------------------------------------------
// Theme: the portfolio shell may tell us its theme; it only affects this page's own chrome.

addEventListener("message", (event) => {
  const data = event.data;
  if (event.source !== parent || !data || data.type !== "portfolio:theme") return;
  if (data.theme === "light" || data.theme === "dark") document.documentElement.dataset.theme = data.theme;
});

// ------------------------------------------------------------------------------------------------
// Terminal output

let lastSpan = null;
let lastKind = null;

function append(kind, text) {
  if (!text) return;
  const stick = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
  if (kind !== lastKind || !lastSpan) {
    lastSpan = document.createElement("span");
    lastSpan.className = kind;
    lastSpan.appendChild(document.createTextNode(""));
    out.appendChild(lastSpan);
    lastKind = kind;
  }
  lastSpan.firstChild.appendData(text);
  if (stick) out.scrollTop = out.scrollHeight;
}

function endsWithNewline() {
  const t = out.textContent;
  return t.length === 0 || t.endsWith("\n");
}

function note(text) {
  if (!endsWithNewline()) append("note", "\n");
  append("note", text + "\n");
}

// A page note while the program is waiting at its prompt goes ABOVE the prompt line, so the
// transcript still reads "Enter path to directory: <typed path>".
function noteAbovePrompt(text) {
  if (endsWithNewline() || !lastSpan) return note(text);
  const noteEl = document.createElement("span");
  noteEl.className = "note";
  noteEl.textContent = text + "\n";
  const node = lastSpan.firstChild;
  const cut = node.data.lastIndexOf("\n");
  if (cut < 0) {
    lastSpan.before(noteEl);
    return;
  }
  const tailSpan = document.createElement("span");
  tailSpan.className = lastSpan.className;
  tailSpan.appendChild(node.splitText(cut + 1));
  lastSpan.after(noteEl, tailSpan);
  lastSpan = tailSpan;
}

function textOf(kind) {
  return [...out.querySelectorAll("span." + kind)].map((s) => s.textContent).join("");
}

function announce(text) {
  els.live.textContent = text;
}

// ------------------------------------------------------------------------------------------------
// UI state

let state = "loading"; // loading | input | running | exited | error
let firstPrompt = true;

// Buttons use aria-disabled (not disabled) so keyboard focus is never dropped mid-run.
function enable(button, on) {
  button.setAttribute("aria-disabled", String(!on));
}
const enabled = (button) => button.getAttribute("aria-disabled") !== "true";

function setState(next, detail) {
  state = next;
  const labels = { loading: "Starting", input: "Waiting for input", running: "Running", exited: `Exited (status ${detail})`, error: "Error" };
  els.pill.textContent = labels[next];
  els.pill.dataset.state = next;
  const ready = next === "input" || next === "exited";
  input.disabled = next === "loading" || next === "error";
  input.readOnly = next !== "input";
  input.placeholder = next === "input" ? "Folder path, e.g. /files/sample-music"
    : next === "running" ? "Running…"
    : next === "exited" ? "Enter to run again"
    : "Waiting for the JVM…";
  enable(els.send, ready);
  els.send.textContent = next === "exited" ? "Run again" : "Enter";
  enable(els.sample, ready);
  enable(els.addFiles, ready || next === "running");
  enable(els.addFolder, ready || next === "running");
}

function setStep(name, stepState) {
  const li = els.steps.querySelector(`[data-step="${name}"]`);
  if (li) li.dataset.state = stepState;
  if (stepState === "active") metrics.steps[name] = Math.round(performance.now());
}

// ------------------------------------------------------------------------------------------------
// Actions from the page to the program. Java pulls them through its native methods.

const queue = [];
let wake = null;

function push(action) {
  queue.push(action);
  if (wake) { const w = wake; wake = null; w(); }
}

async function take() {
  while (queue.length === 0) await new Promise((resolve) => { wake = resolve; });
  return queue.shift();
}

function submitLine(text) {
  if (state === "input") push({ type: "line", text });
  else if (state === "exited") { push({ type: "restart" }); push({ type: "line", text }); }
}

// ------------------------------------------------------------------------------------------------
// Sample library (fetched while the runtime loads, written to /files/ once the JVM is up)

let sampleFiles = null;

async function loadSample() {
  const manifest = await (await fetch("sample-music.json")).json();
  const files = await Promise.all(manifest.files.map(async (f) => {
    const url = "sample-music/" + f.path.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return { path: f.path, bytes: new Int8Array(await res.arrayBuffer()), tags: f.tags };
  }));
  renderLibrary(files);
  return files;
}

function renderLibrary(files) {
  $("library-count").textContent = `(${files.length} files, ${(files.reduce((n, f) => n + f.bytes.length, 0) / 1024).toFixed(0)} KB)`;
  const tree = $("library-tree");
  tree.textContent = "";
  const seen = new Set();
  const li = (text, cls, depth) => {
    const el = document.createElement("li");
    el.style.paddingLeft = depth * 14 + "px";
    if (cls) el.className = cls;
    el.textContent = text;
    tree.appendChild(el);
    return el;
  };
  li("sample-music/", "dir", 0);
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts.slice(0, i + 1).join("/");
      if (!seen.has(key)) { seen.add(key); li(parts[i] + "/", "dir", i + 1); }
    }
    const el = li(parts.at(-1), "", parts.length);
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = f.tags.length ? f.tags.join(" + ") : "no tags";
    el.appendChild(tag);
  }
}

// ------------------------------------------------------------------------------------------------
// Files the visitor picks: read locally, copied into the JVM's virtual disk, never uploaded.

async function pickedFiles(fileList) {
  const all = [...fileList];
  const mp3 = all.filter((f) => /\.mp3$/i.test(f.name));
  const skipped = all.length - mp3.length;
  if (mp3.length === 0) {
    noteAbovePrompt(`# No .mp3 files in that selection${skipped ? ` (${skipped} other file${skipped > 1 ? "s" : ""} ignored)` : ""}.`);
    return;
  }
  let total = 0;
  const chosen = [];
  for (const f of mp3) {
    if (chosen.length >= MAX_USER_FILES || total + f.size > MAX_USER_BYTES) break;
    total += f.size;
    chosen.push(f);
  }
  const files = await Promise.all(chosen.map(async (f) => ({
    path: safePath(f.webkitRelativePath || f.name),
    bytes: new Int8Array(await f.arrayBuffer()),
  })));
  const extra = [];
  if (skipped) extra.push(`${skipped} non-MP3 file${skipped > 1 ? "s" : ""} left out`);
  if (chosen.length < mp3.length) extra.push(`${mp3.length - chosen.length} over the ${MAX_USER_FILES}-file / 150 MB limit left out`);
  push({ type: "import", files, extra });
  submitLine(USER_DIR);
}

function safePath(p) {
  const parts = p.split(/[\\/]+/).map((s) => s.replace(/[\u0000-\u001f]/g, "").trim())
    .filter((s) => s && s !== "." && s !== "..");
  return parts.join("/") || "file.mp3";
}

async function importFiles(lib, action) {
  const Console = await lib.web.BrowserConsole;
  await Console.deleteTree(USER_DIR);
  for (const f of action.files) await Console.putFile(USER_DIR + "/" + f.path, f.bytes);
  const n = action.files.length;
  noteAbovePrompt(`# Copied ${n} MP3 file${n > 1 ? "s" : ""} into ${USER_DIR} (read in your browser, not uploaded)` +
    (action.extra.length ? `; ${action.extra.join(", ")}` : "") + ".");
}

// ------------------------------------------------------------------------------------------------
// Native methods of web.BrowserConsole, implemented here.

const natives = {
  async Java_web_BrowserConsole_prepare(lib) {
    setStep("jvm", "done");
    setStep("files", "active");
    els.loadingTitle.textContent = "Copying the sample library…";
    const Console = await lib.web.BrowserConsole;
    await Console.deleteTree(USER_DIR); // forget files picked on an earlier visit
    await Console.deleteTree(SAMPLE_DIR);
    const files = await sampleFiles;
    for (const f of files) await Console.putFile(SAMPLE_DIR + "/" + f.path, f.bytes);
    setStep("files", "done");
    setStep("main", "active");
    els.loadingTitle.textContent = "Starting the program…";
  },

  async Java_web_BrowserConsole_write(lib, fd, text) {
    append(fd === 2 ? "e" : "o", text);
  },

  async Java_web_BrowserConsole_readLine(lib) {
    if (firstPrompt) {
      firstPrompt = false;
      metrics.readyMs = Math.round(performance.now());
      performance.mark("music-search:ready");
      setStep("main", "done");
      els.loading.hidden = true;
      announce("Java is running. The program asks: Enter path to directory.");
    }
    setState("input");
    if (document.activeElement === els.send) input.focus(); // came from "Run again": type next
    for (;;) {
      const action = await take();
      if (action.type === "import") { await safeImport(lib, action); continue; }
      if (action.type !== "line") continue;
      append("in", action.text + "\n"); // terminal echo
      setState("running");
      return action.text;
    }
  },

  async Java_web_BrowserConsole_exited(lib, status) {
    metrics.runs++;
    setState("exited", status);
    note(`# Program exited with status ${status}.`);
    announce(`Program finished with status ${status}. Press Enter or Run again to start it again.`);
    for (;;) {
      const action = await take();
      if (action.type === "import") { await safeImport(lib, action); continue; }
      if (action.type === "restart") {
        append("cmd", "\n$ java controller.MetadataExtractor\n");
        setState("running");
        return true;
      }
    }
  },
};

async function safeImport(lib, action) {
  try {
    await importFiles(lib, action);
  } catch (err) {
    noteAbovePrompt(`# Could not copy those files into the virtual disk: ${err?.message || err}`);
  }
}

// ------------------------------------------------------------------------------------------------
// Boot

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load " + src));
    document.head.appendChild(s);
  });
}

async function boot() {
  setState("loading");
  els.loading.hidden = false;
  els.loading.classList.remove("failed");
  els.retry.hidden = true;
  const started = performance.now();
  let preloadText = "";
  const tick = setInterval(() => {
    if (state !== "loading" || els.loading.classList.contains("failed")) return clearInterval(tick);
    els.detail.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s` + (preloadText ? ` · ${preloadText}` : "");
  }, 100);
  try {
    setStep("runtime", "active");
    els.loadingTitle.textContent = "Downloading the CheerpJ runtime…";
    sampleFiles = loadSample();
    sampleFiles.catch(() => {});
    const preload = fetch("cheerpj-preload.json").then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined);
    await loadScript(CHEERPJ_LOADER);
    setStep("runtime", "done");
    setStep("jvm", "active");
    els.loadingTitle.textContent = "Booting Java 21 in WebAssembly…";
    await cheerpjInit({
      version: JAVA_VERSION,
      status: "none",
      natives,
      preloadResources: await preload,
      preloadProgress(done, total) { preloadText = `runtime files ${done}/${total}`; },
    });
    append("cmd", "$ java controller.MetadataExtractor\n");
    const exit = await cheerpjRunMain("web.BrowserConsole", CLASSPATH);
    note(`# The JVM stopped (exit code ${exit}). Reload the page to start it again.`);
    setState("error");
  } catch (err) {
    console.error(err);
    setState("error");
    if (els.loading.hidden) {
      note(`# The Java runtime stopped: ${err?.message || err}. Reload the page to start it again.`);
      return;
    }
    for (const li of els.steps.querySelectorAll('[data-state="active"]')) li.dataset.state = "failed";
    els.loading.classList.add("failed");
    els.loadingTitle.textContent = "The Java runtime could not start.";
    els.detail.textContent = (err?.message || String(err)) +
      ". Check the connection or any content blocker. The original source is below.";
    announce("The Java runtime could not start.");
    if (typeof cheerpjInit === "undefined") els.retry.hidden = false; // the loader never arrived: retry is safe
  }
}

// ------------------------------------------------------------------------------------------------
// Controls

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state === "input") {
    submitLine(input.value);
    input.value = "";
  } else if (state === "exited") {
    push({ type: "restart" }); // "Run again"
  }
});
els.sample.addEventListener("click", () => { if (enabled(els.sample)) submitLine(SAMPLE_DIR); });
els.addFiles.addEventListener("click", () => { if (enabled(els.addFiles)) els.pickFiles.click(); });
els.addFolder.addEventListener("click", () => { if (enabled(els.addFolder)) els.pickFolder.click(); });
for (const picker of [els.pickFiles, els.pickFolder]) {
  picker.addEventListener("change", async () => {
    const list = picker.files;
    if (list && list.length) await pickedFiles(list);
    picker.value = "";
  });
}
els.clear.addEventListener("click", () => {
  out.textContent = "";
  lastSpan = null;
  lastKind = null;
});
els.retry.addEventListener("click", () => {
  document.querySelectorAll('script[src="' + CHEERPJ_LOADER + '"]').forEach((s) => s.remove());
  for (const li of els.steps.children) delete li.dataset.state;
  boot();
});
// Keep keyboard focus useful: after a run starts from the toolbar, the prompt is the next stop.
input.addEventListener("keydown", (e) => {
  if (e.key === "Escape") input.value = "";
});

// ------------------------------------------------------------------------------------------------
// Original source viewer (loaded on demand)

$("source-panel").addEventListener("toggle", async function onToggle(e) {
  if (!e.target.open || e.target.dataset.loaded) return;
  e.target.dataset.loaded = "1";
  const code = $("source-code");
  try {
    const { files } = await (await fetch("source.json")).json();
    const order = ["MetadataExtractor.java", "FileUtils.java", "SongDetails.java", "pom.xml"];
    files.sort((a, b) => order.indexOf(a.path.split("/").at(-1)) - order.indexOf(b.path.split("/").at(-1)));
    const tabs = $("source-tabs");
    const buttons = files.map((f, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.id = "tab-" + i;
      b.textContent = f.path.split("/").at(-1);
      b.title = f.path;
      b.setAttribute("aria-controls", "source-code");
      b.addEventListener("click", () => select(i));
      b.addEventListener("keydown", (ev) => {
        const d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
        if (d) { ev.preventDefault(); select((i + d + files.length) % files.length, true); }
      });
      tabs.appendChild(b);
      return b;
    });
    function select(i, focus) {
      buttons.forEach((b, j) => {
        b.setAttribute("aria-selected", String(i === j));
        b.tabIndex = i === j ? 0 : -1;
      });
      code.setAttribute("aria-labelledby", "tab-" + i);
      code.textContent = `// ${files[i].path}\n${files[i].text}`;
      if (focus) buttons[i].focus();
    }
    select(0);
  } catch {
    code.textContent = "Could not load the source.";
  }
});

boot();
