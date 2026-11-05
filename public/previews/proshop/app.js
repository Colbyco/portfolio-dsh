// ProShop contribution viewer. Vanilla JS, no dependencies. Data: ./data.json (built by
// previews-src/proshop/fetch-data.mjs from the GitHub API + local git history).

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Uses the calendar date as written in the timestamp (git dates keep the author's offset).
const fmtDate = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}` }
const short = (sha) => sha.slice(0, 7)
const base = (p) => p.split('/').pop()
const ext = (p) => (p.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || ''
const langOf = (p) => ({ js: 'jsx', jsx: 'jsx', mjs: 'jsx', cjs: 'jsx', ts: 'jsx', tsx: 'jsx', json: 'json' })[ext(p)] || 'plain'
const delta = (a, d) => `<span class="plus">+${a}</span> <span class="minus">−${d}</span>`
const ext_link = (href, text, cls = '') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${text}<span class="sr"> (opens GitHub in a new tab)</span></a>`

const state = { data: null, source: 'pr', file: null, mode: innerWidth >= 960 ? 'split' : 'unified', wrap: false, expanded: new Set() }

// ---------------------------------------------------------------- theme
function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return
  document.documentElement.dataset.theme = theme
  const btn = $('#theme-btn')
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')
}
$('#theme-btn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'))
addEventListener('message', (e) => {
  if (e.data && e.data.type === 'portfolio:theme') setTheme(e.data.theme)
})

// ---------------------------------------------------------------- tiny JS/JSX/JSON highlighter
const KW = new Set('import export from default as const let var function return if else for while do switch case break continue new delete typeof instanceof in of try catch finally throw async await class extends super this yield void static'.split(' '))
const LIT = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'])
const newState = () => ({ block: false, tpl: false, tag: false, expectTag: false, depth: 0 })

function hl(line, st, lang) {
  if (lang === 'plain') return esc(line)
  let out = ''
  let i = 0
  let last = '' // last significant character, used to tell JSX "<" from "less than"
  const L = line.length
  const push = (cls, s) => {
    out += cls ? `<span class="${cls}">${esc(s)}</span>` : esc(s)
    const t = s.trimEnd()
    if (t) last = t[t.length - 1]
  }
  while (i < L) {
    if (st.block) {
      const e = line.indexOf('*/', i)
      const end = e < 0 ? L : e + 2
      push('c', line.slice(i, end))
      i = end
      if (e >= 0) st.block = false
      continue
    }
    if (st.tpl) {
      let j = i
      while (j < L && line[j] !== '`') j += line[j] === '\\' ? 2 : 1
      if (j >= L) { push('s', line.slice(i)); i = L } else { push('s', line.slice(i, j + 1)); i = j + 1; st.tpl = false }
      continue
    }
    const ch = line[i]
    const rest = line.slice(i)
    if (ch === '/' && line[i + 1] === '/') { push('c', rest); break }
    if (ch === '/' && line[i + 1] === '*') { st.block = true; push('c', '/*'); i += 2; continue }
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < L && line[j] !== ch) j += line[j] === '\\' ? 2 : 1
      const isKey = !st.tag && /^\s*:/.test(line.slice(j + 1)) && lang === 'json'
      push(isKey ? 'y' : 's', line.slice(i, j + 1))
      i = j + 1
      continue
    }
    if (ch === '`') { st.tpl = true; push('s', '`'); i++; continue }
    if (/[0-9]/.test(ch) && !/[\w$]/.test(line[i - 1] || '')) {
      const m = /^(0[xX][\da-fA-F]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?)/.exec(rest)
      push('n', m[0]); i += m[0].length
      continue
    }
    if (/[A-Za-z_$]/.test(ch)) {
      if (st.expectTag) {
        const t = /^[A-Za-z_$][\w$.:-]*/.exec(rest)[0]
        push('t', t); i += t.length; st.expectTag = false; st.tag = true; st.depth = 0
        continue
      }
      const w = /^[A-Za-z_$][\w$]*/.exec(rest)[0]
      let cls = ''
      if (st.tag && st.depth === 0) cls = 'a' // JSX attribute name
      else if (KW.has(w)) cls = 'k'
      else if (LIT.has(w)) cls = 'l'
      else if (/^\s*\(/.test(line.slice(i + w.length))) cls = 'f'
      push(cls, w); i += w.length
      continue
    }
    if (lang === 'jsx' && ch === '<' && /^<\/?[A-Za-z>]/.test(rest) && !/[\w$)\]]/.test(last)) {
      if (rest[1] === '>') { push('t', '<>'); i += 2; continue }
      const open = rest[1] === '/' ? '</' : '<'
      push('p', open); i += open.length; st.expectTag = true
      continue
    }
    if (st.tag) {
      if (ch === '{') st.depth++
      else if (ch === '}') st.depth = Math.max(0, st.depth - 1)
      else if (st.depth === 0 && (ch === '>' || rest.startsWith('/>'))) {
        const t = ch === '>' ? '>' : '/>'
        push('p', t); i += t.length; st.tag = false
        continue
      }
    }
    push('', ch); i++
  }
  return out
}

// ---------------------------------------------------------------- diff parsing
function parsePatch(patch, lang) {
  const hunks = []
  let h = null, o = 0, n = 0, so, sn
  for (const raw of patch.split('\n')) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw)
    if (m) {
      h = { header: raw, lines: [] }
      hunks.push(h)
      o = +m[1]; n = +m[2]; so = newState(); sn = newState()
      continue
    }
    if (!h || raw === '') continue // GitHub context lines always start with " "
    const t = raw[0]
    const text = raw.slice(1)
    if (t === '+') h.lines.push({ t: 'add', n: n++, html: hl(text, sn, lang) })
    else if (t === '-') h.lines.push({ t: 'del', o: o++, html: hl(text, so, lang) })
    else if (t === '\\') h.lines.push({ t: 'meta', html: esc(raw) })
    else { hl(text, so, lang); h.lines.push({ t: 'ctx', o: o++, n: n++, html: hl(text, sn, lang) }) }
  }
  return hunks
}

function pairRows(lines) {
  const rows = []
  for (let i = 0; i < lines.length;) {
    if (lines[i].t === 'ctx' || lines[i].t === 'meta') { rows.push([lines[i], lines[i]]); i++; continue }
    const dels = [], adds = []
    while (i < lines.length && lines[i].t === 'del') dels.push(lines[i++])
    while (i < lines.length && lines[i].t === 'add') adds.push(lines[i++])
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push([dels[k] || null, adds[k] || null])
  }
  return rows
}

const SIGN = { add: '+', del: '-', ctx: ' ' }
function unifiedTable(hunks) {
  let html = '<table class="d d-uni"><colgroup><col class="c-ln"><col class="c-ln"><col></colgroup><tbody>'
  for (const h of hunks) {
    html += `<tr class="hunk"><td colspan="3">${esc(h.header)}</td></tr>`
    for (const l of h.lines) {
      if (l.t === 'meta') { html += `<tr class="meta"><td></td><td></td><td class="code">${l.html}</td></tr>`; continue }
      html += `<tr class="${l.t}"><td class="ln">${l.o ?? ''}</td><td class="ln">${l.n ?? ''}</td><td class="code"><span class="sg" aria-hidden="true">${SIGN[l.t]}</span>${l.html}</td></tr>`
    }
  }
  return html + '</tbody></table>'
}

function splitTable(hunks) {
  let html = '<table class="d d-split"><colgroup><col class="c-ln"><col class="c-code"><col class="c-ln"><col class="c-code"></colgroup><tbody>'
  const cell = (l, side) => {
    if (!l) return '<td class="ln empty"></td><td class="code empty"></td>'
    if (l.t === 'meta') return `<td class="ln"></td><td class="code meta">${l.html}</td>`
    const t = l.t === 'ctx' ? 'ctx' : l.t
    return `<td class="ln ${t}">${side === 'old' ? l.o : l.n}</td><td class="code ${t}">${l.html}</td>`
  }
  for (const h of hunks) {
    html += `<tr class="hunk"><td colspan="4">${esc(h.header)}</td></tr>`
    for (const [a, b] of pairRows(h.lines)) html += `<tr>${cell(a, 'old')}${cell(b, 'new')}</tr>`
  }
  return html + '</tbody></table>'
}

// ---------------------------------------------------------------- model helpers
function sourceInfo() {
  const d = state.data
  if (state.source === 'pr') {
    return { files: d.pr.files, fileUrl: (f) => `${d.pr.files_url}#${f.anchor}`, label: `PR #${d.pr.number}` }
  }
  return { files: d.commit.files, fileUrl: (f) => `${d.commit.html_url}#${f.anchor}`, label: `Commit ${short(d.commit.sha)}` }
}

// which of Colby's commits touched a file (PR only: maps "Smells 1 - 3 Fixed" etc. to files)
function touchedBy(filename) {
  if (state.source !== 'pr') return []
  return state.data.pr.commits.filter((c) => c.files.some((f) => f.path === filename))
}

// ---------------------------------------------------------------- tree
function buildTree(files) {
  const root = { name: '', dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.filename.split('/')
    let node = root
    for (const p of parts.slice(0, -1)) {
      if (!node.dirs.has(p)) node.dirs.set(p, { name: p, dirs: new Map(), files: [] })
      node = node.dirs.get(p)
    }
    node.files.push(f)
  }
  const compress = (node) => {
    for (const child of node.dirs.values()) compress(child)
    if (node.name && node.dirs.size === 1 && node.files.length === 0) {
      const [only] = node.dirs.values()
      node.name = `${node.name}/${only.name}`
      node.dirs = only.dirs
      node.files = only.files
    }
  }
  compress(root)
  return root
}

function treeHtml(node) {
  let html = '<ul>'
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
  for (const d of dirs) {
    html += `<li><span class="dir"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>${esc(d.name)}/</span>${treeHtml(d)}</li>`
  }
  for (const f of [...node.files].sort((a, b) => a.filename.localeCompare(b.filename))) {
    html += `<li><button type="button" class="file" data-file="${esc(f.filename)}" title="${esc(f.filename)}"><span class="st st-${esc(f.status)}" aria-hidden="true">${esc(f.status[0].toUpperCase())}</span><span class="fname">${esc(base(f.filename))}</span><span class="fdelta">${delta(f.additions, f.deletions)}</span></button></li>`
  }
  return html + '</ul>'
}

function orderedFiles(node, out = []) {
  for (const d of [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) orderedFiles(d, out)
  for (const f of [...node.files].sort((a, b) => a.filename.localeCompare(b.filename))) out.push(f)
  return out
}

function renderTree() {
  const { files } = sourceInfo()
  const tree = buildTree(files)
  const nav = $('#tree')
  nav.innerHTML = `<p class="tree-title">${files.length} changed file${files.length === 1 ? '' : 's'}</p>${treeHtml(tree)}`
  if (!files.some((f) => f.filename === state.file)) state.file = orderedFiles(tree)[0]?.filename || null
  syncTreeSelection()
}

function syncTreeSelection() {
  for (const b of $$('#tree .file')) {
    const on = b.dataset.file === state.file
    b.setAttribute('aria-current', on ? 'true' : 'false')
    b.tabIndex = on ? 0 : -1
  }
}

$('#tree').addEventListener('click', (e) => {
  const b = e.target.closest('.file')
  if (!b) return
  state.file = b.dataset.file
  syncTreeSelection()
  renderDiff()
})
$('#tree').addEventListener('keydown', (e) => {
  const buttons = $$('#tree .file')
  const i = buttons.indexOf(document.activeElement)
  if (i < 0) return
  let j = null
  if (e.key === 'ArrowDown') j = Math.min(buttons.length - 1, i + 1)
  else if (e.key === 'ArrowUp') j = Math.max(0, i - 1)
  else if (e.key === 'Home') j = 0
  else if (e.key === 'End') j = buttons.length - 1
  if (j === null) return
  e.preventDefault()
  buttons[j].focus()
  buttons[j].click()
})

// ---------------------------------------------------------------- diff panel
function renderDiff() {
  const { files, fileUrl } = sourceInfo()
  const f = files.find((x) => x.filename === state.file)
  const box = $('#diff')
  if (!f) { box.innerHTML = '<p class="empty-note">No file selected.</p>'; return }
  const by = touchedBy(f.filename)
  const prev = f.previous_filename ? `<span class="muted"> (renamed from ${esc(f.previous_filename)})</span>` : ''
  let head = `<div class="dhead">
      <div class="dpath"><span class="st st-${esc(f.status)}">${esc(f.status)}</span> <code>${esc(f.filename)}</code>${prev}</div>
      <div class="dmeta">${delta(f.additions, f.deletions)} ${ext_link(fileUrl(f), 'View on GitHub ↗', 'gh')}</div>
      ${by.length ? `<div class="dby">Changed in ${by.map((c) => `${ext_link(c.url, `<code>${short(c.sha)}</code>`)} “${esc(c.message.split('\n')[0])}”`).join(', ')}</div>` : ''}
    </div>`
  let body
  const key = `${state.source}:${f.filename}`
  if (f.patch == null) body = '<p class="empty-note">GitHub did not return a text diff for this file (binary or too large).</p>'
  else if (/(^|\/)package-lock\.json$/.test(f.filename) && !state.expanded.has(key)) {
    body = `<div class="collapsed"><p>Generated lock file (${f.additions} added, ${f.deletions} removed lines). Hidden by default.</p><button type="button" class="btn" data-expand="${esc(key)}">Show diff</button></div>`
  } else {
    const hunks = parsePatch(f.patch, langOf(f.filename))
    body = `<div class="dscroll${state.wrap ? ' wrap' : ''}" tabindex="0" role="region" aria-label="Diff of ${esc(base(f.filename))}">${state.mode === 'split' ? splitTable(hunks) : unifiedTable(hunks)}</div>`
  }
  box.innerHTML = head + body
  box.scrollTop = 0
}

$('#diff').addEventListener('click', (e) => {
  const b = e.target.closest('[data-expand]')
  if (!b) return
  state.expanded.add(b.dataset.expand)
  renderDiff()
  $('#diff .dscroll')?.focus()
})

function syncModeControls() {
  for (const x of $$('.seg button')) x.setAttribute('aria-pressed', String(x.dataset.mode === state.mode))
  const wrap = $('#wrap')
  wrap.disabled = state.mode === 'split' // split view always wraps
  wrap.checked = state.mode === 'split' || state.wrap
  wrap.closest('label').title = wrap.disabled ? 'Split view always wraps long lines' : ''
}
for (const b of $$('.seg button')) {
  b.addEventListener('click', () => {
    state.mode = b.dataset.mode
    syncModeControls()
    renderDiff()
  })
}
$('#wrap').addEventListener('change', (e) => { state.wrap = e.target.checked; renderDiff() })

// ---------------------------------------------------------------- tabs
function renderTabs() {
  const d = state.data
  const tabs = [
    { id: 'pr', label: `PR #${d.pr.number}`, sub: `${d.pr.changed_files} files` },
    { id: 'commit', label: `Commit ${short(d.commit.sha)}`, sub: `${d.commit.files.length} files` },
  ]
  $('#tabs').innerHTML = tabs.map((t) => `<button type="button" role="tab" id="tab-${t.id}" data-source="${t.id}" aria-controls="viewer-panel" aria-selected="${t.id === state.source}" tabindex="${t.id === state.source ? 0 : -1}">${esc(t.label)} <span class="muted">· ${esc(t.sub)}</span></button>`).join('')
  $('#viewer-panel').setAttribute('aria-labelledby', `tab-${state.source}`)
}
function selectSource(id, focus) {
  state.source = id
  state.file = null
  renderTabs()
  renderTree()
  renderDiff()
  if (focus) $(`#tab-${id}`).focus()
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) selectSource(b.dataset.source) })
$('#tabs').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  const ids = ['pr', 'commit']
  const i = ids.indexOf(state.source)
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
  selectSource(ids[j], true)
})

// ---------------------------------------------------------------- summary cards + history
function renderCards() {
  const d = state.data
  const pr = d.pr
  const localDate = (sha) => (d.history.colbyCommits.find((c) => c.sha === sha) || {}).date
  const prCommits = pr.commits.map((c) => `<li><code>${short(c.sha)}</code> <q>${esc(c.message.split('\n')[0])}</q>${c.merge ? ' <span class="tag">merge</span>' : c.files.length ? ` <span class="muted">— ${c.files.map((f) => esc(base(f.path))).join(', ')}</span>` : ''}</li>`).join('')
  const cm = d.commit
  const h = d.history
  const nonMerge = h.colbyCommits.filter((c) => !c.merge).length
  const dates = h.colbyCommits.map((c) => c.date).sort()
  const upstreamOthers = h.upstreamAuthors.filter((a) => a.name !== 'Brad Traversy').length
  $('#cards').innerHTML = `
    <article class="card">
      <p class="kicker">Pull request #${pr.number} · ${pr.merged ? 'merged' : esc(pr.state)} ${fmtDate(pr.merged_at || pr.created_at)}</p>
      <dl class="quote-list">
        <div><dt>Title</dt><dd><q>${esc(pr.title)}</q></dd></div>
        <div><dt>Description</dt><dd><q>${esc(pr.body || '')}</q></dd></div>
      </dl>
      <p class="meta"><code>${esc(pr.head.ref)}</code> → <code>${esc(pr.base.ref)}</code>${pr.sameRepository ? ' (same repository)' : ''} · ${pr.commits.length} commits · ${pr.changed_files} files · ${delta(pr.additions, pr.deletions)}</p>
      <details class="mini"><summary>Commits in this PR</summary><ol>${prCommits}</ol></details>
      <p class="links">${ext_link(pr.html_url, 'Open PR #1 on GitHub ↗')}</p>
    </article>
    <article class="card">
      <p class="kicker">Commit ${short(cm.sha)} · ${fmtDate(localDate(cm.sha) || cm.date)}</p>
      <dl class="quote-list">
        <div><dt>Message</dt><dd><q>${esc(cm.message)}</q></dd></div>
      </dl>
      <ul class="flist">${cm.files.map((f) => `<li><code>${esc(base(f.filename))}</code> ${delta(f.additions, f.deletions)}</li>`).join('')}</ul>
      <p class="meta">${cm.files.length} files · ${delta(cm.stats.additions, cm.stats.deletions)}</p>
      <p class="links">${ext_link(cm.html_url, `Open commit ${short(cm.sha)} on GitHub ↗`)}</p>
    </article>
    <article class="card">
      <p class="kicker">Local git history</p>
      <p class="big">${h.colbyCommits.length} commits by Colby</p>
      <p class="meta">${nonMerge} non-merge, ${h.colbyCommits.length - nonMerge} merge · ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}</p>
      <ul class="facts">
        ${h.forkBase ? `<li>Forked from ${ext_link(d.repo.upstream_url, esc(d.repo.upstream))} at <code>${short(h.forkBase.sha)}</code> (<q>${esc(h.forkBase.subject)}</q>, ${fmtDate(h.forkBase.date)})</li>` : ''}
        <li>${h.upstreamCommitCount} upstream commits (Brad Traversy and ${upstreamOthers} other upstream author${upstreamOthers === 1 ? '' : 's'})</li>
        <li>${h.otherContributorCommitCount} commits by other contributors to this fork</li>
      </ul>
      <p class="links"><a href="#history">Jump to Colby's commit list ↓</a></p>
    </article>`
}

function renderHistory() {
  const d = state.data
  const list = [...d.history.colbyCommits].sort((a, b) => b.date.localeCompare(a.date))
  $('#history-sub').textContent = `· ${list.length} commits, newest first (author “Colby Baker”)`
  $('#commits').innerHTML = list.map((c) => `
    <li class="commit${c.merge ? ' is-merge' : ''}">
      <div class="c-top"><time datetime="${esc(c.date)}">${fmtDate(c.date)}</time> ${ext_link(c.url, `<code>${short(c.sha)}</code>`, 'sha')} <span class="c-msg">${esc(c.subject)}</span>${c.merge ? ' <span class="tag">merge</span>' : ''}</div>
      ${c.files.length ? `<ul class="c-files">${c.files.map((f) => `<li><span class="st st-${f.status === 'A' ? 'added' : f.status === 'D' ? 'removed' : 'modified'}" title="${f.status === 'A' ? 'added' : f.status === 'D' ? 'deleted' : 'modified'}">${esc(f.status)}</span> ${esc(f.path)}</li>`).join('')}</ul>` : ''}
    </li>`).join('')
  $('#foot').innerHTML = `Data collected ${fmtDate(d.generatedOn || d.generatedAt)} from the GitHub API (${ext_link(d.repo.html_url, esc(d.repo.full_name))}: PR #${d.pr.number}, commit ${short(d.commit.sha)}) and the repository's git history. Diffs are shown as GitHub returns them.`
}

// ---------------------------------------------------------------- boot
fetch('./data.json')
  .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
  .then((data) => {
    state.data = data
    syncModeControls()
    renderCards()
    renderTabs()
    renderTree()
    renderDiff()
    renderHistory()
  })
  .catch((err) => {
    $('#cards').innerHTML = `<p class="loading">Could not load contribution data (${esc(err.message)}).</p>`
  })
