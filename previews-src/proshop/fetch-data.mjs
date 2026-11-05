// Build-time data collection for the ProShop contribution viewer.
//
// Read-only: `gh api` GET requests (GitHub) + `git log/show/rev-list` on the local reference
// clone. Writes public/previews/proshop/data.json. Nothing here runs in the browser.
//
// Usage: node fetch-data.mjs [path-to-proshop-v2-clone]
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CLONE = process.argv[2] || 'C:\\Users\\colby\\repos\\colby-portfolio-dsh-sources\\proshop-v2'
const OUT = join(here, '..', '..', 'public', 'previews', 'proshop', 'data.json')
const REPO = 'Colbyco/proshop-v2'
const PR_NUMBER = 1
const COMMIT = '704b9f6'
const COLBY_EMAIL = '59655851+Colbyco@users.noreply.github.com'

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })
const gh = (path) => JSON.parse(run('gh', ['api', '-H', 'Accept: application/vnd.github+json', path]))
const ghAll = (path) => JSON.parse(run('gh', ['api', '--paginate', '--slurp', path])).flat()
const git = (...args) => run('git', ['-C', CLONE, ...args]).replace(/\s+$/, '')
const anchor = (filename) => 'diff-' + createHash('sha256').update(filename).digest('hex')
const pickFile = (f) => ({
  filename: f.filename,
  previous_filename: f.previous_filename || null,
  status: f.status,
  additions: f.additions,
  deletions: f.deletions,
  patch: f.patch ?? null,
  anchor: anchor(f.filename),
})

// ---- repository + upstream ----
const repo = gh(`repos/${REPO}`)
const upstream = repo.parent ? repo.parent.full_name : null

// ---- PR #1 ----
const pr = gh(`repos/${REPO}/pulls/${PR_NUMBER}`)
const prCommits = ghAll(`repos/${REPO}/pulls/${PR_NUMBER}/commits?per_page=100`)
const prFiles = ghAll(`repos/${REPO}/pulls/${PR_NUMBER}/files?per_page=100`)
const filesTouched = (sha) => {
  const out = git('show', '--no-renames', '--name-status', '--format=', sha)
  return out ? out.split('\n').filter(Boolean).map((l) => { const [status, ...p] = l.split('\t'); return { status, path: p.join('\t') } }) : []
}

// ---- commit 704b9f6 ----
const commit = gh(`repos/${REPO}/commits/${COMMIT}`)

// ---- local history: Colby's commits vs upstream ----
const upstreamBranches = upstream ? gh(`repos/${upstream}/branches?per_page=100`) : []
const upstreamRepo = upstream ? gh(`repos/${upstream}`) : null
// merge base between upstream's default branch and the fork's default branch = the fork point
const compare = upstream ? gh(`repos/${upstream}/compare/${upstreamRepo.default_branch}...${REPO.split('/')[0]}:${repo.default_branch}`) : null
const forkBase = compare ? compare.merge_base_commit.sha : null
const localHas = (sha) => {
  try {
    run('git', ['-C', CLONE, 'cat-file', '-e', `${sha}^{commit}`], { stdio: ['ignore', 'pipe', 'ignore'] })
    return true
  } catch {
    return false // e.g. upstream commits made after the fork are not in the local clone
  }
}
const upstreamTips = [forkBase, ...upstreamBranches.map((b) => b.commit.sha)].filter((s, i, a) => s && a.indexOf(s) === i && localHas(s))
const SEP = '\u001f'
const logLines = git('log', '--all', '--date=iso-strict', `--format=%H${SEP}%P${SEP}%an${SEP}%ae${SEP}%ad${SEP}%s`, ...upstreamTips.map((s) => `^${s}`))
const forkCommits = logLines ? logLines.split('\n').map((l) => { const [sha, parents, name, email, date, subject] = l.split(SEP); return { sha, parents: parents ? parents.split(' ') : [], name, email, date, subject } }) : []
const isColby = (c) => /colby/i.test(c.name) || c.email.toLowerCase() === COLBY_EMAIL.toLowerCase()
const colbyCommits = forkCommits.filter(isColby).map((c) => ({
  sha: c.sha,
  date: c.date,
  subject: c.subject,
  author: c.name,
  merge: c.parents.length > 1,
  files: c.parents.length > 1 ? [] : filesTouched(c.sha),
  url: `https://github.com/${REPO}/commit/${c.sha}`,
}))
const upstreamCount = Number(git('rev-list', '--count', ...upstreamTips))
// grouped by email, so one person committing under two spellings of their name counts once
const byEmail = new Map()
for (const l of git('shortlog', '-sne', ...upstreamTips).split('\n')) {
  const m = l.trim().match(/^(\d+)\s+(.*?)\s+<([^>]*)>$/)
  const e = byEmail.get(m[3].toLowerCase()) || { names: [], commits: 0 }
  e.names.push(m[2])
  e.commits += Number(m[1])
  byEmail.set(m[3].toLowerCase(), e)
}
const upstreamAuthors = [...byEmail.values()].map((e) => ({ name: e.names[0], aliases: e.names.slice(1), commits: e.commits })).sort((a, b) => b.commits - a.commits)

const now = new Date()
const data = {
  generatedAt: now.toISOString(),
  generatedOn: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, // local date

  sources: {
    github: [`gh api repos/${REPO}`, `gh api repos/${REPO}/pulls/${PR_NUMBER}{,/commits,/files}`, `gh api repos/${REPO}/commits/${COMMIT}`, upstream && `gh api repos/${upstream}/branches`, upstream && `gh api repos/${upstream}/compare/...`].filter(Boolean),
    localGit: `git log --all (excluding commits reachable from upstream: ${upstreamTips.map((s) => s.slice(0, 7)).join(', ')})`,
  },
  repo: {
    full_name: repo.full_name,
    html_url: repo.html_url,
    description: repo.description,
    default_branch: repo.default_branch,
    fork: repo.fork,
    upstream,
    upstream_url: upstream ? `https://github.com/${upstream}` : null,
  },
  pr: {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    merged: pr.merged,
    user: pr.user.login,
    created_at: pr.created_at,
    closed_at: pr.closed_at,
    merged_at: pr.merged_at,
    merged_by: pr.merged_by ? pr.merged_by.login : null,
    head: { label: pr.head.label, ref: pr.head.ref, repo: pr.head.repo && pr.head.repo.full_name, sha: pr.head.sha },
    base: { label: pr.base.label, ref: pr.base.ref, repo: pr.base.repo && pr.base.repo.full_name },
    sameRepository: Boolean(pr.head.repo && pr.head.repo.full_name === pr.base.repo.full_name),
    additions: pr.additions,
    deletions: pr.deletions,
    changed_files: pr.changed_files,
    html_url: pr.html_url,
    files_url: `${pr.html_url}/files`,
    commits: prCommits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
      merge: c.parents.length > 1,
      files: c.parents.length > 1 ? [] : filesTouched(c.sha),
      url: c.html_url,
    })),
    files: prFiles.map(pickFile),
  },
  commit: {
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author.name,
    date: commit.commit.author.date,
    parents: commit.parents.map((p) => p.sha),
    stats: commit.stats,
    html_url: commit.html_url,
    files: commit.files.map(pickFile),
  },
  history: {
    forkBase: forkBase ? { sha: forkBase, date: git('show', '-s', '--format=%aI', forkBase), subject: git('show', '-s', '--format=%s', forkBase), author: git('show', '-s', '--format=%an', forkBase) } : null,
    upstreamTips,
    upstreamCommitCount: upstreamCount,
    upstreamAuthors,
    forkOnlyCommitCount: forkCommits.length,
    otherContributorCommitCount: forkCommits.filter((c) => !isColby(c)).length,
    colbyCommits,
  },
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(data))
console.log(`wrote ${OUT} (${(JSON.stringify(data).length / 1024).toFixed(1)} KiB)`)
console.log(`PR #${pr.number} "${pr.title}" body=${JSON.stringify(pr.body)} head=${pr.head.label} base=${pr.base.label} sameRepo=${data.pr.sameRepository}`)
console.log(`commit ${commit.sha.slice(0, 7)} "${commit.commit.message}" files=${commit.files.length}`)
console.log(`fork base ${forkBase && forkBase.slice(0, 7)}; upstream commits ${upstreamCount}; fork-only ${forkCommits.length}; Colby ${colbyCommits.length}`)
