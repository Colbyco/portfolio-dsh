# Random Summoner Spell Generator: portfolio preview

Stage URL: **`/previews/summoner/`** (static, built output in `public/previews/summoner/`).

## Original

- Repository history (copied into `original/` from commit `8f2887c`, 2021-09-05): first commit
  2021-07-09; built in July 2021, with small follow-up commits in August and September 2021. The git
  history includes merged pull requests from a collaborator (`kira0x1`) for the `client.js`
  refactor and the Summoner's Rift/ARAM map mode.
- Stack: Express 4 + EJS 3 server (`app.js`), one view (`views/index.ejs`), vanilla JS
  (`public/js/client.js`), Bootstrap 5.0.2 CSS from jsDelivr, and 64x64 spell PNGs (`Images/`).
- Behaviour: `GET /` renders the page with a random pair from the 10 standard spells (never Mark,
  never the same spell twice). In the browser, **Randomize** rolls two different spells from the
  active ones (fewer than 2 active shows `alert("Pick 2 or more spells")`), clicking an icon toggles
  it (it turns greyscale when off), **Toggle All** inverts every spell (it skips Mark on Summoner's
  Rift), **ARAM** turns Mark on, and **Summoner's Rift** turns it off again. Mark cannot be toggled
  on Summoner's Rift.

## What is unchanged

| File in the preview | Source |
|---|---|
| `index.html` | `views/index.ejs` rendered by EJS with the exact locals `app.js` passes (see below) |
| `js/client.js` | verbatim |
| `css/main.css` | verbatim |
| `vendor/bootstrap-5.0.2/bootstrap.min.css` | Bootstrap **5.0.2** (the version in the original template URL and lockfile), byte-identical to the jsDelivr file; the template's `integrity="sha384-EVSTQN3/…"` attribute is kept, so the browser itself verifies this |
| `Images/*.png` | same pixels as the originals (lossless re-encode, see below) |

Markup, copy, class names, inline handlers (including the original duplicate `img img` attribute
typos), and all spell rules are the original ones. The headless test runs the same click script against
the original Express app and the preview: console output, alerts, final state, DOM, and pixels are
identical.

## Adaptations (static hosting only)

1. **Server render becomes a build step.** `build.mjs` runs the original `app.js` with a small
   stand-in for `express` that records its routes and `express.static` mounts. It then calls the
   recorded `GET /` handler and renders `views/index.ejs` with the handler's own
   `res.render('index', { spells: randomSpellGen() })` locals. The static mounts (`/css`, `/Images`,
   `/js`) are copied to the same relative paths.
2. **Random pair per visit.** The server chose a new pair on every request. On static hosting, the
   same functions from `app.js` (extracted verbatim by the build) run once per page load in a
   small inline script. It sets the same two `<img>` tags before first paint. The result has the same
   distribution and rules.
3. **Script path.** `<script src="/js/client.js">` became `js/client.js`, because a root-absolute
   path would 404 under `/previews/summoner/`. The other asset paths in the template were already
   relative.
4. **Bootstrap is vendored** instead of loading from the CDN. The preview makes no third-party
   requests.
5. **Lossless PNG optimisation** (`png-optimize.mjs`, no dependencies). All spell images are fully
   opaque, so RGBA becomes RGB. Each file is then re-filtered and re-deflated at maximum
   compression. ImageMagick metadata (`tEXt`, `tIME`, `bKGD`) is dropped, while the `gAMA`/`cHRM`
   colour chunks are kept byte-for-byte. Every file is decoded again and compared pixel-by-pixel
   with its original. Total size went from 106,818 to 90,514 bytes (−15.3%).
6. **Keyboard access (additive, `preview/keyboard.js` + `preview/preview.css`).** In the original,
   the 11 grid icons respond only to mouse clicks. The preview makes each one focusable
   (`tabindex=0`, `role=button`, `aria-label="Toggle <Spell>"`, `aria-pressed` mirroring the
   grey-out). Enter and Space call the icon's own original `onclick`. A Bootstrap-blue focus ring
   shows keyboard focus. Mouse behaviour and visuals are unchanged, and the pixel comparison with
   the original still passes.

Not reproduced: `POST /`. Nothing on the page posts to it, and the original route renders the view
without `spells`, which throws in EJS (`spells is not defined`). The client calls no other server
endpoints: there is no fetch or XHR.

**Responsive check:** no layout fix was needed. From 360 to 1400 px there is no horizontal overflow,
because Bootstrap's `.row` wraps the 11 icon columns (5/5/1 at 360 px, 10/1 at 768 px). That is the
original behaviour, so it is kept. None of these adaptations changes what a visitor sees, so the
preview carries no disclosure note.

## Attribution

The summoner spell icons are League of Legends artwork © Riot Games, Inc., used here as in the
original project. This project isn't endorsed by Riot Games and doesn't reflect the views or opinions
of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot
Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
Bootstrap 5.0.2 is MIT-licensed (© The Bootstrap Authors, Twitter Inc.; see the file header).

## Rebuild

```sh
cd previews-src/summoner
npm install          # build-only: bootstrap 5.0.2, ejs; express + chalk for the parity server
npm run build        # -> public/previews/summoner/
```

## Test

```sh
cd previews-src/summoner
node qa/original-server.cjs --port 4420     # public/ + the ORIGINAL app.js mounted at "/"
python qa/test_preview.py                   # parity + rules + keyboard + layout + screenshots
# or, with any static server on public/ (e.g. node scripts/dev-server.mjs --root public --port 4420):
python qa/test_preview.py --preview-only
```

The test runs 66 checks in headless Chrome (temporary profile), and the latest run passed all of
them. It covers the initial pair (always two different server spells) and thousands of rolls (no
duplicates, only active spells, all active spells eventually appear). It also covers the alert
below 2 active spells, the Mark/ARAM rules, Toggle All in both modes, and parity with the original.
Further checks cover keyboard toggling, no horizontal scroll at 360/390/768/1024/1280/1400 px, no
console errors, zero third-party requests, and FCP well under 1.5 s. Screenshots go to
`qa/previews/summoner-1280x800.png`, `summoner-390x720.png`, `summoner-360x560.png`, and
`summoner-original-1280x800.png` (the original server, for comparison).

## Known limitations

- `alert("Pick 2 or more spells")` needs `allow-modals` if the shell ever sandboxes the iframe.
- Without JavaScript, the page shows the pair chosen when the build ran (instead of a fresh pair per
  request) and the buttons do nothing, as in the original.
- Payload: 255 KB raw / about 116 KB over the wire. Bootstrap CSS is 156 KB raw / 23 KB gzip, kept
  whole and unmodified so the SRI check still holds. The 11 PNGs total 90.5 KB.
