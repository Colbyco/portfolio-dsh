# ProShop course project – contribution viewer (April 2024)

Stage entry: `/previews/proshop/` (static files in `public/previews/proshop/`: `index.html`,
`app.js`, `styles.css`, `data.json`).

## What this preview is

`Colbyco/proshop-v2` is a GitHub fork of Brad Traversy's ProShop course project,
[bradtraversy/proshop-v2](https://github.com/bradtraversy/proshop-v2) (MERN + Redux Toolkit).
Colby extended it in a college course.

The preview does not run the shop. It is a self-contained **contribution viewer** that shows
exactly what Colby changed:

- **Header:** "ProShop course project · MERN · Redux Toolkit · April 2024", plus one line crediting
  Brad Traversy's course project as the base and saying Colby's contributions are shown below.
- **Summary cards:** they quote the PR title and description and the commit message without
  embellishment, and add only numbers taken from the data (files, +/− lines, dates, commit counts).
- **Diff viewer:**
  - Tabs: **PR #1** and **Commit 704b9f6**.
  - A file tree of the changed files.
  - **Unified / Split** diff views; split view always wraps long lines, like GitHub. Unified view
    has a "Wrap lines" toggle.
  - A tiny self-written JS/JSX/JSON syntax highlighter.
  - A "View on GitHub" link per file. For PR files it also lists which PR commit changed that file.
  - The lock file diff is collapsed by default ("Show diff").
- **History list:** Colby's commits in the fork from local git history (date, SHA linked to GitHub,
  message, changed files with status).
- **Original sites:** links to the PR and the commit on GitHub; they open in a new tab because
  GitHub refuses to be framed.

## Data (build time only; nothing is fetched from GitHub at runtime)

`fetch-data.mjs` writes `public/previews/proshop/data.json` (48.6 KB, 10.7 KB gzip). It uses
read-only `gh api` GET calls, made while authenticated as Colbyco:

- `repos/Colbyco/proshop-v2`: fork of `bradtraversy/proshop-v2`, default branch `groupMain`.
- `repos/Colbyco/proshop-v2/pulls/1`, `/pulls/1/commits`, `/pulls/1/files`: title, body, dates,
  commits, files, patches.
- `repos/Colbyco/proshop-v2/commits/704b9f6`: message, stats, files, patches.
- `repos/bradtraversy/proshop-v2/branches` and `repos/bradtraversy/proshop-v2/compare/main...Colbyco:groupMain`:
  the upstream branch tips and the fork point (merge base).

It also runs read-only `git log` / `git show` / `git rev-list` / `git shortlog` on the local
reference clone `colby-portfolio-dsh-sources/proshop-v2`, which has all branches:

- **Colby's commits** = author name contains "Colby" or email
  `59655851+Colbyco@users.noreply.github.com`. Only commits that are not reachable from upstream
  count.
- **Upstream** = everything reachable from the fork point `63b0b9a` or from the upstream branches
  `originalCourseCode` (`d5b15e5`) and `security-fixes` (`4900d42`). Upstream `main` has moved past
  the fork (`e23e3a8`), but that commit is not in the clone and is skipped.

## Findings (as reported by the data, checked 2026-11-04)

### PR #1

- **Where it went:** it was opened **inside the fork**, from `Colbyco:colby` into
  `Colbyco:groupMain`. It is not a PR to Brad Traversy's upstream repository.
- **Who and when:** opened and merged by Colbyco on 2024-04-06 (18:56Z → merged 18:58Z).
- **Size:** 8 commits, 6 files, +220 −198.
- **Title:** "Colby". **Description, in full:** "10 Code Smells Completed".
- **The "10 code smells" claim:** the PR text says exactly this and nothing more. It does not list
  or describe the smells. The commit messages count up to ten:

| Commit | Message | Files it changed |
|---|---|---|
| `36114ea` | Smells 1 - 3 Fixed | PlaceOrderScreen.jsx, ProductScreen.jsx |
| `1f8965a` | Code smell 4 fixed | ProfileScreen.jsx |
| `7110847` | Code Smell 5 Fixed | admin/UserEditScreen.jsx |
| `02d0479` | Smells 6-9 Fixed | CheckoutSteps.jsx |
| `e3f642f` | Code Smell 10 Fixed | SearchBox.jsx |

  The PR also contains "init" and "update gitignore" (housekeeping) and a merge of `groupMain`
  into `colby`.

- **What the diffs visibly do** (as code, not named smells):
  - CheckoutSteps: adds `PropTypes`.
  - SearchBox and UserEditScreen: merge duplicate `react-router-dom` imports.
  - PlaceOrderScreen: uses `key={item._id}` instead of the array index.
  - ProfileScreen: moves the nested loading/error/table ternary into a `content` variable.
  - ProductScreen: merges its duplicate imports and moves its nested loading/error/product ternary
    into a `content` variable the same way (+149 −143, mostly re-indentation).

  The viewer shows these diffs but does not label them with smell names, because no source names
  them.

### Commit 704b9f6

- **Message:** "Facebook and Google logic implemented".
- **When:** 2024-04-29, 21:52 −04:00 (2024-04-30 01:52Z).
- **Files:** 3 files, +339 −21.
  - `frontend/src/screens/LoginScreen.jsx` +78 −21
  - `package.json` +1 (adds `google-auth-library`)
  - `package-lock.json` +260
- **What it contains:** the LoginScreen diff includes a Google OAuth **client ID** and a Facebook
  **app ID** hard-coded in JSX. Both are public identifiers that are already in the public GitHub
  repository; they are not secrets. They are shown verbatim because the viewer reproduces the diff
  exactly.

### Local git history

- **Colby:** 17 commits (13 non-merge, 4 merge), 2024-04-01 → 2024-04-29.
  - Besides the PR above, they include "Social Login Frontend Implemented" (`cfc47ac`, Apr 19),
    "Comments added for clarity" (`3eafa2c`), "Fixed package-lock and package.json" (`cf5279f`),
    "fixed possible merge errors removing Save For Later functionality" (`90dc1cb`), and
    merges into `groupMain`.
- **Fork point:** `63b0b9a`, "Update readme.md", Brad Traversy, 2024-02-20.
- **Upstream:** 140 commits. Brad Traversy wrote 81; three other upstream authors wrote 59. Authors
  are grouped by email: Will Adams 54, Anthony P / Anthony Perez 3, basir 2.
- **Other contributors to the fork:** 58 commits. Their names are not shown in the viewer, only the
  count.

## Original vs. adapted

Nothing from the original app is executed or modified. The viewer is new code: vanilla JS, about
21 KB plus 12 KB of CSS, with no dependencies, no CDN and no webfonts. Code comes from the GitHub
patches and is shown unchanged.

## UI notes

- **Theme:** dark by default. The ☀/☾ button toggles it, and `postMessage({type:"portfolio:theme", theme})`
  is honoured; values other than `light`/`dark` are ignored.
- **Keyboard:**
  - Skip link; Tab reaches every control.
  - Tabs: ←/→/Home/End, with focus following selection.
  - File tree: ↑/↓/Home/End (roving tabindex, `aria-current`).
  - Layout buttons use `aria-pressed`, and the diff region is focusable for keyboard scrolling.
  - Focus outlines are visible.
- **Layout:**
  - 3 cards above 1080 px, 2 cards above 760 px, then 1.
  - Below 760 px the tree stacks above the diff.
  - Split view scrolls horizontally inside the diff panel at small widths. The page itself never
    scrolls horizontally from 360 to 1400 px.
- **Default diff layout:** split at ≥960 px wide, unified below.

## Payload

The first visit is 4 same-origin requests: 85.0 KB raw, **22.5 KB gzip**. First contentful paint
was ~120 ms on the local server.

## Rebuild

```powershell
cd previews-src/proshop
node fetch-data.mjs [path-to-proshop-v2-clone]   # needs authenticated gh (read-only GETs) + the clone
node build.mjs                                    # copies site/ -> public/previews/proshop/ (keeps data.json)
```

No npm install is needed. `package.json` only holds scripts.

## Test

```powershell
node scripts/dev-server.mjs --root public --port 4430     # from the portfolio root
python previews-src/proshop/qa/test_preview.py
python previews-src/proshop/qa/iframe_check.py   # both previews embedded in iframes + theme message from the parent
```

The test checks:
- header and credit text, and the quoted PR body and commit message
- switching files by click and with the arrow, Home and End keys
- unified and split layouts, with +60/−50 rows matching GitHub's stats for ProfileScreen.jsx
- the wrap toggle, and that split view never overflows its columns
- tab keyboard navigation, the collapsed lock file, and the theme message and button
- the GitHub links
- no third-party requests and no console errors or warnings
- no horizontal page scroll at 390×720, 360×560, 768×900 and 1400×900

Screenshots go to `qa/previews/proshop-*.png`.

## Known limitations

- **Static snapshot:** the data does not update. Re-run `fetch-data.mjs` to refresh it.
- **Lightweight highlighter:**
  - Words in JSX text that match JS keywords may be coloured.
  - `${…}` inside template literals is not highlighted separately.
  - An apostrophe in JSX text colours the rest of that line as a string.
- **Patch-only diffs:** they show only GitHub's hunks; there is no "expand context". Per-commit
  diffs inside the PR are not shown. Instead, each PR file lists the commit(s) that changed it.
- **Fragile GitHub anchors:** "View on GitHub" file anchors use GitHub's `#diff-<sha256(path)>`
  scheme. If GitHub changes that scheme, the link still opens the PR files page or the commit page,
  just not the exact file.
