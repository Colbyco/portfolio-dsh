(() => {
  'use strict';
  const D = window.LIBRARY_PREVIEW;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const STATUS = { 200: 'OK', 201: 'Created', 204: 'No Content', 308: 'Permanent Redirect', 400: 'Bad Request', 404: 'Not Found',
    413: 'Payload Too Large', 414: 'URI Too Long', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 504: 'Gateway Timeout' };

  // ---- theme: default dark; ?theme=light; shell postMessage; toggle button ----
  const themeBtn = $('theme');
  function setTheme(t) {
    if (t !== 'light' && t !== 'dark') return;
    document.documentElement.dataset.theme = t;
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }
  setTheme(new URLSearchParams(location.search).get('theme') || 'dark');
  themeBtn.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (d && typeof d === 'object' && d.type === 'portfolio:theme') setTheme(d.theme);
  });

  if (D.shimEnabled) $('shim-note').hidden = false;

  // ---- endpoints ----
  const state = { route: null, ids: { authorId: null, bookId: null }, values: {} };
  const list = $('ep-list');
  $('ep-count').textContent = D.routes.length;
  const pathHtml = (p) => esc(p).replace(/:(\w+)/g, '<span class="p">:$1</span>');
  D.routes.forEach((r, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ep';
    b.dataset.i = i;
    b.innerHTML = `<span class="badge m-${r.method}">${r.method}</span><span class="path">${pathHtml(r.path)}</span><span class="ep-desc">${esc(cap(r.description))}</span>`;
    b.setAttribute('aria-label', `${r.method} ${r.path}: ${cap(r.description)}`);
    b.addEventListener('click', () => select(i, true));
    li.appendChild(b);
    list.appendChild(li);
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const btns = [...list.querySelectorAll('.ep')];
    let i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    i = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
    btns[i].focus();
  });

  // ---- request builder ----
  const form = $('req-form');
  const paramsBox = $('params');
  const bodyField = $('body-field');
  const bodyEl = $('body');
  const bodyErr = $('body-err');
  const queryEl = $('query');

  function defaultParam(name, r) {
    if (state.ids[name] != null) return String(state.ids[name]);
    return (r.example.params && r.example.params[name]) || '1';
  }

  function select(i, focusBuilder) {
    const r = D.routes[i];
    state.route = r;
    list.querySelectorAll('.ep').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.i) === i)));
    const m = $('req-method');
    m.textContent = r.method;
    m.className = `badge m-${r.method}`;
    $('req-desc').innerHTML = `${esc(cap(r.description))}<span class="note">${esc(r.note || '')}</span>`;
    paramsBox.innerHTML = '';
    r.params.forEach((p) => {
      const f = document.createElement('div');
      f.className = 'field';
      f.innerHTML = `<label for="param-${p}">${esc(p)} <span class="opt">path parameter</span></label><input id="param-${p}" data-param="${esc(p)}" type="text" inputmode="numeric" autocomplete="off" spellcheck="false">`;
      f.querySelector('input').value = defaultParam(p, r);
      paramsBox.appendChild(f);
    });
    queryEl.value = '';
    bodyField.hidden = !r.hasBody;
    bodyEl.value = r.hasBody ? JSON.stringify(r.example.body || {}, null, 2) : '';
    bodyErr.textContent = '';
    updateUrl();
    if (focusBuilder) {
      const first = paramsBox.querySelector('input') || (r.hasBody ? bodyEl : $('send'));
      first.focus();
    }
  }

  function buildPath() {
    const r = state.route;
    let path = r.path.replace(/:(\w+)/g, (_, p) => {
      const el = paramsBox.querySelector(`[data-param="${p}"]`);
      return encodeURIComponent(el ? el.value.trim() : '');
    });
    let q = queryEl.value.trim();
    if (q && !q.startsWith('?')) q = `?${q}`;
    return D.base + path + q;
  }

  function updateUrl() {
    $('req-url').innerHTML = esc(buildPath());
  }
  form.addEventListener('input', (e) => {
    if (e.target !== bodyEl) updateUrl();
    else bodyErr.textContent = '';
  });
  $('example').addEventListener('click', () => select(D.routes.indexOf(state.route), true));
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); send(); });

  // ---- response ----
  function highlight(json) {
    // Escape only & < > here: the tokenizer needs the literal quotes (safe inside element content).
    return json.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m) => {
      let c = 'n';
      if (m[0] === '"') c = /:$/.test(m) ? 'k' : 's';
      else if (m === 'true' || m === 'false') c = 'b';
      else if (m === 'null') c = 'z';
      return `<span class="t-${c}">${m}</span>`;
    });
  }
  const fmtBytes = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
  function resetText(h) {
    const at = Date.parse(h || '');
    if (!at) return '';
    const min = Math.max(0, Math.round((at - Date.now()) / 60000));
    return min <= 1 ? 'sandbox resets within a minute' : `sandbox resets in ${min} min`;
  }

  let busy = false;
  async function send() {
    if (busy || !state.route) return;
    const r = state.route;
    let body;
    if (r.hasBody) {
      try {
        body = JSON.stringify(JSON.parse(bodyEl.value || '{}'));
      } catch (err) {
        bodyErr.textContent = `Invalid JSON: ${err.message}`;
        bodyEl.focus();
        return;
      }
    }
    const url = buildPath();
    busy = true;
    const btn = $('send');
    btn.disabled = true;
    const meta = $('res-meta');
    meta.innerHTML = `<span class="muted">Sending ${esc(r.method)} ${esc(url)}…</span>`;
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        method: r.method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body,
        cache: 'no-store',
        redirect: 'follow',
      });
      const text = await res.text();
      const ms = Math.round(performance.now() - t0);
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = undefined; }
      const ct = (res.headers.get('content-type') || '').split(';')[0];
      const reset = resetText(res.headers.get('x-sandbox-reset-at'));
      meta.innerHTML = `<span class="status s-${String(res.status)[0]}">${res.status} ${esc(res.statusText || STATUS[res.status] || '')}</span>`
        + `<span>${ms} ms</span><span>${fmtBytes(new Blob([text]).size)}</span>`
        + (ct ? `<span class="muted mono">${esc(ct)}</span>` : '')
        + (reset ? `<span class="muted">${esc(reset)}</span>` : '');
      $('res-body').innerHTML = parsed !== undefined ? highlight(JSON.stringify(parsed, null, 2)) : esc(text);
      // Carry ids of rows you create into the other forms.
      if (res.ok && Array.isArray(parsed) && parsed[0] && r.method === 'POST') {
        if (parsed[0].book_id != null) state.ids.bookId = parsed[0].book_id;
        else if (parsed[0].author_id != null) state.ids.authorId = parsed[0].author_id;
      }
    } catch (err) {
      meta.innerHTML = `<span class="status s-5">network error</span><span class="muted">${esc(err.message)}</span>`;
      $('res-body').textContent = '';
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  // ---- schema / ERD ----
  const erd = $('erd');
  const arrow = '<svg viewBox="0 0 30 14" aria-hidden="true"><path d="M29 7H3M8 2 3 7l5 5"/></svg>';
  const rels = [];
  D.schema.forEach((t, i) => {
    if (i > 0) {
      const fk = t.columns.find((c) => c.fk && c.fk.table === D.schema[i - 1].name);
      const link = document.createElement('div');
      link.className = 'link';
      link.setAttribute('aria-hidden', 'true');
      link.innerHTML = `${arrow}<span>FK</span>`;
      if (fk) erd.appendChild(link);
    }
    const card = document.createElement('section');
    card.className = 'tbl';
    card.setAttribute('aria-label', `Table ${t.name}`);
    const cols = t.columns.map((c) => {
      const flags = [];
      if (c.pk) flags.push('<span class="flag pk">PK</span>');
      if (c.fk) flags.push(`<span class="flag fk">FK → ${esc(c.fk.table)}.${esc(c.fk.column)}</span>`);
      if (!c.nullable && !c.pk) flags.push('<span class="flag">NN</span>');
      if (c.default != null) flags.push(`<span class="flag">default ${esc(c.default)}</span>`);
      if (c.identity) flags.push('<span class="flag">identity</span>');
      if (c.shim) flags.push(`<span class="tag" title="${esc(c.shim)}">shim</span>`);
      return `<li class="col${c.shimKind === 'column' ? ' shimmed' : ''}"><span class="cn">${esc(c.name)}</span><span class="ct">${esc(c.type)}</span>`
        + (flags.length ? `<span class="flags">${flags.join('')}</span>` : '') + '</li>';
    }).join('');
    card.innerHTML = `<div class="tbl-h"><b>${esc(t.name)}</b><span>${t.rows} seed row${t.rows === 1 ? '' : 's'}</span></div><ul class="cols">${cols}</ul>`;
    erd.appendChild(card);
    t.columns.filter((c) => c.fk).forEach((c) => {
      const oneToOne = c.pk;
      rels.push(`<li><code>${esc(t.name)}.${esc(c.name)}</code> → <code>${esc(c.fk.table)}.${esc(c.fk.column)}</code> (${oneToOne ? 'one-to-one: the FK is also the primary key' : 'many-to-one'})</li>`);
    });
  });
  $('rels').innerHTML = rels.join('');

  select(D.routes.findIndex((r) => r.method === 'GET') >= 0 ? D.routes.findIndex((r) => r.path === '/books') : 0, false);
})();
