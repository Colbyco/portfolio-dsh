// The project stage: one centered frame that shows the selected project's live preview,
// a timeline rail (ARIA tabs, manual activation) and a details panel.

type Mode = "live" | "original" | "simulated" | "contribution" | "career";
interface StageEntry {
  slug: string;
  title: string;
  date: string;
  kind: "project" | "career";
  mode: Mode;
  modeLabel: string;
  url: string | null;
  stampNow: string | null;
  address: string;
  routes: { label: string; url: string; address: string }[] | null;
}

/** Selected quick route per entry (index into entry.routes). */
const routeIndex = new Map<string, number>();

function routeOf(entry: StageEntry) {
  const i = routeIndex.get(entry.slug) ?? 0;
  return entry.routes?.[i] ?? null;
}

/** The URL to load: the selected route (or the entry URL); the first route of an entry with
 * stampNow gets today's date and time in that zone appended. */
function urlFor(entry: StageEntry): string | null {
  const route = routeOf(entry);
  const base = route?.url ?? entry.url;
  if (!base) return null;
  if (!entry.stampNow || (routeIndex.get(entry.slug) ?? 0) !== 0) return base;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: entry.stampNow,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const u = new URL(base);
  u.searchParams.set("date", `${parts.year}-${parts.month}-${parts.day}`);
  u.searchParams.set("time", `${parts.hour}:${parts.minute}`);
  return u.href;
}

const data: StageEntry[] = JSON.parse(document.getElementById("stage-data")!.textContent || "[]");
const bySlug = new Map(data.map((e) => [e.slug, e]));
const order = data.map((e) => e.slug);

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

const tablist = $(".rail-list");
const tabs = $$<HTMLButtonElement>('[role="tab"]', tablist);
const panel = $("#stage-panel");
const frame = $("[data-frame]");
const view = $("[data-view]");
const poster = $<HTMLImageElement>("[data-poster]");
const loading = $("[data-loading]");
const loadingText = $("[data-loading-text]");
const loadingSlow = $("[data-loading-slow]");
const loadingOpen = $<HTMLAnchorElement>("[data-loading-open]");
const addressText = $("[data-address-text]");
const addressIcon = $(".address-icon") as unknown as SVGElement;
const badge = $("[data-badge]");
const openLink = $<HTMLAnchorElement>("[data-open]");
const reloadBtn = $<HTMLButtonElement>("[data-reload]");
const expandBtn = $<HTMLButtonElement>("[data-expand]");
const prevBtn = $<HTMLButtonElement>("[data-prev]");
const nextBtn = $<HTMLButtonElement>("[data-next]");
const prevLabel = $("[data-prev-label]");
const nextLabel = $("[data-next-label]");
const pos = $("[data-pos]");

const MAX_FRAMES = 4; // keep recently viewed previews alive for instant switching
const frames = new Map<string, { el: HTMLIFrameElement; loaded: boolean; used: number }>();
let current = "";
let slowTimer = 0;
/** Becomes true after the visitor's first click/key press. */
let interacted = false;
addEventListener("pointerdown", () => (interacted = true), { once: true, capture: true });
addEventListener("keydown", () => (interacted = true), { once: true, capture: true });
/** When the visitor last used a timeline tab (for returning focus stolen by preview autofocus). */
let tabFocusedAt = 0;
let clock = 0;

const ICONS: Record<Mode, string> = {
  live: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  original: '<path d="m9 8-5 4 5 4"/><path d="m15 8 5 4-5 4"/>',
  simulated: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  contribution: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7"/><path d="M18 11.5c0 3.5-6 2.5-10.5 5"/>',
  career: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 13h18"/>',
};

function absolute(url: string) {
  return new URL(url, location.href).href;
}

function currentTheme(): "light" | "dark" {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function postTheme(el: HTMLIFrameElement) {
  try {
    el.contentWindow?.postMessage({ type: "portfolio:theme", theme: currentTheme() }, "*");
  } catch {}
}

function showLoading(entry: StageEntry) {
  loading.hidden = false;
  loadingSlow.hidden = true;
  loadingText.textContent = `Loading ${entry.title}…`;
  const u = urlFor(entry);
  loadingOpen.href = u ? absolute(u) : "#";
  clearTimeout(slowTimer);
  slowTimer = window.setTimeout(() => (loadingSlow.hidden = false), 12000);
}

function hideLoading() {
  loading.hidden = true;
  clearTimeout(slowTimer);
}

function evictIfNeeded() {
  if (frames.size <= MAX_FRAMES) return;
  const victims = [...frames.entries()].filter(([slug]) => slug !== current).sort((a, b) => a[1].used - b[1].used);
  const [slug, rec] = victims[0];
  rec.el.remove();
  frames.delete(slug);
}

function ensureFrame(entry: StageEntry) {
  let rec = frames.get(entry.slug);
  if (!rec) {
    const el = document.createElement("iframe");
    el.className = "preview-frame";
    el.title = `${entry.title} preview`;
    el.setAttribute("allow", "clipboard-write; fullscreen");
    el.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    rec = { el, loaded: false, used: 0 };
    const r = rec;
    el.addEventListener("load", () => {
      r.loaded = true;
      postTheme(el);
      // Some original apps autofocus a field on load, which would pull focus (and scroll)
      // away from the timeline. Give focus back to the tab the visitor was using.
      const scrollY = window.scrollY;
      setTimeout(() => {
        if (document.activeElement === el && tabFocusedAt && Date.now() - tabFocusedAt < 15000) {
          document.getElementById(`tab-${current}`)?.focus({ preventScroll: true });
          if (Math.abs(window.scrollY - scrollY) > 4) window.scrollTo({ top: scrollY });
        }
      }, 60);
      if (current === entry.slug) {
        hideLoading();
        poster.hidden = true;
      }
    });
    el.src = urlFor(entry)!;
    view.appendChild(el);
    frames.set(entry.slug, rec);
  }
  rec.used = ++clock;
  evictIfNeeded();
  return rec;
}

function setPoster(slug: string) {
  poster.hidden = false;
  poster.onerror = () => (poster.hidden = true);
  const src = `/posters/${slug}.webp`;
  if (!poster.src.endsWith(src)) {
    poster.srcset = `/posters/${slug}-800.webp 800w, ${src} 1280w`;
    poster.src = src;
  }
}

const routeBar = $("[data-routes]");

function renderRoutes(entry: StageEntry) {
  if (!entry.routes?.length) {
    routeBar.hidden = true;
    routeBar.replaceChildren();
    return;
  }
  const active = routeIndex.get(entry.slug) ?? 0;
  routeBar.hidden = false;
  routeBar.replaceChildren(
    ...entry.routes.map((r, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "route-btn";
      b.textContent = r.label;
      b.setAttribute("aria-pressed", String(i === active));
      b.addEventListener("click", () => goRoute(entry, i));
      return b;
    }),
  );
}

function goRoute(entry: StageEntry, i: number) {
  if ((routeIndex.get(entry.slug) ?? 0) === i) return;
  routeIndex.set(entry.slug, i);
  renderRoutes(entry);
  addressText.textContent = routeOf(entry)?.address ?? entry.address;
  const u = urlFor(entry)!;
  openLink.href = absolute(u);
  const rec = ensureFrame(entry);
  rec.loaded = false;
  showLoading(entry);
  rec.el.src = u;
}

function render(entry: StageEntry, { load = true } = {}) {
  // Frame chrome
  addressText.textContent = routeOf(entry)?.address ?? entry.address;
  renderRoutes(entry);
  addressIcon.innerHTML = ICONS[entry.mode];
  badge.className = `badge badge-${entry.mode}`;
  badge.textContent = entry.modeLabel;
  frame.dataset.mode = entry.mode;
  const hasUrl = Boolean(entry.url);
  reloadBtn.disabled = !hasUrl;
  openLink.hidden = !hasUrl;
  if (hasUrl) openLink.href = absolute(urlFor(entry)!);

  // Career cards vs iframes
  $$("[data-career]", view).forEach((c) => (c.hidden = c.dataset.career !== entry.slug));
  frames.forEach((rec, slug) => rec.el.classList.toggle("is-active", slug === entry.slug));

  if (entry.kind === "career" || !entry.url) {
    poster.hidden = true;
    hideLoading();
  } else {
    const rec = frames.get(entry.slug);
    if (rec?.loaded) {
      poster.hidden = true;
      hideLoading();
      rec.el.classList.add("is-active");
      rec.used = ++clock;
    } else if (load) {
      // Posters only after the first interaction; on first load the live preview paints directly.
      if (interacted) setPoster(entry.slug);
      showLoading(entry);
      ensureFrame(entry).el.classList.add("is-active");
    }
  }

  // Details
  $$("[data-detail]").forEach((d) => (d.hidden = d.dataset.detail !== entry.slug));
  const details = $(".details");
  details.scrollTop = 0;

  // Prev / next
  const i = order.indexOf(entry.slug);
  const prev = bySlug.get(order[i - 1]);
  const next = bySlug.get(order[i + 1]);
  prevBtn.disabled = !prev;
  nextBtn.disabled = !next;
  prevLabel.textContent = prev ? prev.title : "Start";
  nextLabel.textContent = next ? next.title : "End";
  prevBtn.setAttribute("aria-label", prev ? `Previous: ${prev.title}` : "No previous project");
  nextBtn.setAttribute("aria-label", next ? `Next: ${next.title}` : "No next project");
  pos.textContent = `${i + 1} of ${order.length}`;
}

/** Scroll only the rail (never the page) so the selected tab is visible. */
function revealInRail(tab: HTMLElement) {
  const box = tablist.getBoundingClientRect();
  const r = tab.getBoundingClientRect();
  if (r.top < box.top) tablist.scrollTop -= box.top - r.top + 8;
  else if (r.bottom > box.bottom) tablist.scrollTop += r.bottom - box.bottom + 8;
  if (r.left < box.left) tablist.scrollLeft -= box.left - r.left + 8;
  else if (r.right > box.right) tablist.scrollLeft += r.right - box.right + 8;
}

function select(slug: string, opts: { focus?: boolean; load?: boolean; updateHash?: boolean } = {}) {
  const entry = bySlug.get(slug);
  if (!entry) return;
  current = slug;
  tabs.forEach((t) => {
    const on = t.dataset.slug === slug;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    if (on) {
      if (opts.focus) t.focus({ preventScroll: true });
      revealInRail(t);
    }
  });
  panel.setAttribute("aria-labelledby", `tab-${slug}`);
  render(entry, { load: opts.load !== false });
  if (opts.updateHash !== false) history.replaceState(null, "", `#${slug}`);
}

// Rail keyboard support (manual activation: arrows move focus, Enter/Space selects).
tablist.addEventListener("keydown", (ev) => {
  const idx = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (idx < 0) return;
  const horizontal = tablist.getAttribute("aria-orientation") === "horizontal";
  const back = horizontal ? "ArrowLeft" : "ArrowUp";
  const fwd = horizontal ? "ArrowRight" : "ArrowDown";
  let target = -1;
  if (ev.key === back) target = Math.max(0, idx - 1);
  else if (ev.key === fwd) target = Math.min(tabs.length - 1, idx + 1);
  else if (ev.key === "Home") target = 0;
  else if (ev.key === "End") target = tabs.length - 1;
  if (target > -1) {
    ev.preventDefault();
    tabs.forEach((t, i) => (t.tabIndex = i === target ? 0 : -1));
    tabs[target].focus();
  }
});
tabs.forEach((t) =>
  t.addEventListener("click", () => {
    tabFocusedAt = Date.now();
    select(t.dataset.slug!);
  }),
);

// Anything with data-select jumps to an entry (intro link, "Start from 2021", experience list).
document.addEventListener("click", (ev) => {
  const el = (ev.target as Element).closest<HTMLElement>("[data-select]");
  if (!el) return;
  ev.preventDefault();
  select(el.dataset.select!, { focus: true });
  $("#theater").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
});

prevBtn.addEventListener("click", () => {
  const i = order.indexOf(current);
  if (i > 0) select(order[i - 1]);
});
nextBtn.addEventListener("click", () => {
  const i = order.indexOf(current);
  if (i < order.length - 1) select(order[i + 1]);
});

reloadBtn.addEventListener("click", () => {
  const entry = bySlug.get(current);
  const rec = frames.get(current);
  if (!entry?.url || !rec) return;
  rec.loaded = false;
  showLoading(entry);
  rec.el.src = urlFor(entry)!;
});
$("[data-retry]").addEventListener("click", () => reloadBtn.click());

// Full screen: native API when available, otherwise an expanded overlay.
expandBtn.addEventListener("click", async () => {
  if (document.fullscreenElement) return document.exitFullscreen();
  if (frame.requestFullscreen) {
    try {
      await frame.requestFullscreen();
      return;
    } catch {}
  }
  frame.classList.toggle("is-expanded");
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && frame.classList.contains("is-expanded")) frame.classList.remove("is-expanded");
});
document.addEventListener("fullscreenchange", () => {
  expandBtn.setAttribute("aria-label", document.fullscreenElement ? "Exit full screen" : "Full screen preview");
});

// Theme: system -> light -> dark -> system.
const themeBtn = $<HTMLButtonElement>("[data-theme-toggle]");
function labelTheme() {
  const t = document.documentElement.dataset.theme || "system";
  themeBtn.setAttribute("aria-label", `Color theme: ${t}`);
  themeBtn.title = `Theme: ${t}`;
}
themeBtn.addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme;
  const nextTheme = cur === "light" ? "dark" : cur === "dark" ? undefined : "light";
  if (nextTheme) document.documentElement.dataset.theme = nextTheme;
  else delete document.documentElement.dataset.theme;
  try {
    nextTheme ? localStorage.setItem("theme", nextTheme) : localStorage.removeItem("theme");
  } catch {}
  labelTheme();
  frames.forEach((r) => postTheme(r.el));
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => frames.forEach((r) => postTheme(r.el)));
labelTheme();

// Rail orientation follows the layout (vertical column vs horizontal strip on small screens).
const narrow = matchMedia("(max-width: 1099px)");
const syncOrientation = () => tablist.setAttribute("aria-orientation", narrow.matches ? "horizontal" : "vertical");
narrow.addEventListener("change", syncOrientation);
syncOrientation();

// Size the theater to the space left in the first viewport (desktop).
function fitTheater() {
  const theater = $("#theater");
  const top = theater.getBoundingClientRect().top + window.scrollY;
  document.documentElement.style.setProperty("--above-theater", `${Math.round(top)}px`);
}
addEventListener("resize", fitTheater);

// Initial selection: deep link or the featured project. The server-rendered HTML already shows the
// featured project, so the first pass (which measures layout) waits until after the first frame,
// and the live iframe starts after the page has loaded so nothing competes with first paint.
const initial = bySlug.has(location.hash.slice(1)) ? location.hash.slice(1) : order.includes("aspicio") ? "aspicio" : order[0];
current = initial;
let booted = false;
const boot = () => {
  if (booted) return;
  booted = true;
  fitTheater();
  select(initial, { load: false, updateHash: false });
};
requestAnimationFrame(() => setTimeout(boot, 0));
const start = () => {
  boot();
  select(current, { load: true, updateHash: false });
};
if (document.readyState === "complete") setTimeout(start, 50);
else addEventListener("load", () => setTimeout(start, 50), { once: true });
// Server previews run on serverless functions that boot Postgres (PGlite) on a cold start
// (~5-7 s). Warm them quietly once the page is idle, and again when a visitor points at them.
const WARM: Record<string, string> = { weather: "/api/weather/", library: "/api/library/authors" };
const warmed = new Map<string, number>();
function warm(slug: string) {
  const url = WARM[slug];
  const last = warmed.get(slug) ?? 0;
  if (!url || Date.now() - last < 120000) return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  warmed.set(slug, Date.now());
  fetch(url, { method: slug === "weather" ? "HEAD" : "GET", cache: "no-store" }).catch(() => {});
}
const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
addEventListener(
  "load",
  () => (idle ? idle(() => Object.keys(WARM).forEach(warm), { timeout: 6000 }) : setTimeout(() => Object.keys(WARM).forEach(warm), 3000)),
  { once: true },
);
tabs.forEach((t) => {
  const slug = t.dataset.slug!;
  if (!WARM[slug]) return;
  t.addEventListener("pointerenter", () => warm(slug));
  t.addEventListener("focus", () => warm(slug));
});

addEventListener("hashchange", () => {
  const slug = location.hash.slice(1);
  if (bySlug.has(slug) && slug !== current) select(slug, { updateHash: false });
});
