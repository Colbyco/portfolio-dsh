# OpenAI Chatbot (June 2022) – preview

Stage entry: `/previews/openai-chatbot/` (built output in `public/previews/openai-chatbot/`).

- Original source: [Colbyco/OpenAI-Chat-Bot](https://github.com/Colbyco/OpenAI-Chat-Bot) (6 commits, 2022-06-29 to 2022-06-30).
- Original deployment (still live, used as the visual and behavioural reference): <https://openai-chat-bot.pages.dev/>.
- Stack: Vue 3.2.37, Vuetify 3.0.0-beta.4, Vite 2.9.12, `openai` SDK 3.0.0, calling `text-davinci-002` from the browser.

## The original build, reproduced exactly

`npm ci` with the **original `package-lock.json`** works on Node 24.18 / npm 11.16. No toolchain
upgrades were needed. Versions installed: vite 2.9.12, @vitejs/plugin-vue 2.3.3,
vite-plugin-vuetify 1.0.0-alpha.12, esbuild 0.14.46, vuetify 3.0.0-beta.4, vue 3.2.37.
Building the **unmodified** source gives a JS bundle that is byte-identical to the one deployed
at openai-chat-bot.pages.dev (`/assets/index.6746f76c.js`, 201,064 bytes, SHA-256
`6DC4FC78…48545`). The CSS file even has the same name and hash (`index.0095e3b0.css`). Only the JS
file name hash differs.

- npm 11 does not run esbuild's `postinstall` script because of its `allow-scripts` policy. The build
  still works because esbuild 0.14 finds its binary in the `esbuild-windows-64` optional package.
- `public/index.html` in the original repo is an empty file. Vite overwrites it with the built
  `index.html`, so it was not copied.

## How the original got its API key

The user had to bring their own key. There is no key, `.env` file, or `import.meta.env` usage in
the repo, and the deployed bundle contains no `sk-…` string. Here is how it worked in
`HelloWorld.vue`:

1. The settings drawer (cog button) has an **"API Key"** `v-text-field` bound to the
   `userAPIKey` ref (memory only). It has a 51-character counter and a "Get Your Key Here" link to
   `beta.openai.com/account/api-keys`.
2. `apiValidation(key)` runs as a field rule. It only accepts a key that is exactly 51 characters,
   then calls `openai.listModels()` with it. On success it sets `validation = true`.
3. `apiCall(m)` does nothing unless `validation` is true and the message is ≤100 characters. When
   both hold, it calls `createCompletion({ model: "text-davinci-002", prompt: "You are a chat bot\n--------\nuser:${m}\nyou:", max_tokens, temperature })`
   and renders `response.data.choices[0].text.trim()`.

## Why it needed adapting

According to OpenAI's deprecations page
(<https://developers.openai.com/api/docs/deprecations>, which `platform.openai.com/docs/deprecations`
now redirects to; fetched 2026-11-04):

- Under "2023-07-06: GPT and embeddings", `text-davinci-002` has a shutdown date of **2024-01-04**.
  The recommended replacement was `gpt-3.5-turbo-instruct`.
- Under "2025-09-26: Legacy GPT model snapshots", `gpt-3.5-turbo-instruct`, `babbage-002` and
  `davinci-002` all had their access shut down on **2026-09-28**.
- The Completions API reference
  (<https://developers.openai.com/api/reference/resources/completions/methods/create>) lists only
  those three models. So no completions-compatible model is left, and the bridge translates the
  prompt to **Chat Completions** instead.
- The model used is **`gpt-6-luna`**. OpenAI describes it as "Our most efficient model for focused,
  high-volume tasks". It supports Chat Completions but not the legacy Completions endpoint
  (<https://developers.openai.com/api/docs/models/gpt-6-luna>).
- `temperature` only works when `reasoning_effort` is `"none"`
  (<https://developers.openai.com/api/docs/guides/latest-model>, "Unsupported parameters").
- `max_tokens` is deprecated in favour of `max_completion_tokens`
  (<https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create>).

## Adaptations (every change, marked `[preview]` in the code)

| File | Change | Why |
|---|---|---|
| `index.html` | Added a slim **portfolio bar** above `#app`: "text-davinci-002 was retired by OpenAI. To chat live, paste your own OpenAI API key (kept in this tab's memory only, sent only to api.openai.com)." It has a password input plus **Use** / **Clear** buttons and a status line. Also added a second module script. | The original model is gone and the build must not contain keys. The bar is a separate DOM sibling of the app, not inside it. |
| `src/components/HelloWorld.vue` | 3 marked edits. (1) Import `Configuration`/`OpenAIApi` from the bridge instead of `openai`. (2) `apiCall` no longer requires `validation.value` (the >100-character check stays). (3) `apiValidation` returns `true` while a bar key is set. | (1) The single call site goes through the bridge. (2) Without a key the bot must answer with a notice instead of doing nothing. (3) Otherwise the original "Please Enter a Valid API Key" hint would stay under the Message field even with a working key. |
| `src/portfolio/openai-bridge.js` (new) | Copies the tiny `openai` v3 surface the component uses: `Configuration`, `OpenAIApi.createCompletion`, `OpenAIApi.listModels`. Details below. | Keeps the component's code and UI unchanged. |
| `src/portfolio/preview-bar.js`, `preview.css` (new) | Wires the bar to the bridge. The input is emptied after **Use**, so the key is not left in the DOM. Also adds the "fit" CSS (below). | – |
| `src/plugins/vuetify.js` | Imports `generated/mdi-subset.css` instead of the full `@mdi/font` CSS. | Same MDI 5.9.55 glyphs, but only the 4 icons the UI uses (cog-outline, github, linkedin, email). This saves ~330 KB of CSS and a 318 KB font. |
| `src/plugins/webfontloader.js` | Imports `generated/roboto.css` instead of loading Google Fonts at runtime. `loadFonts()` is kept as a no-op. | No third-party requests. Same family and weights as the original request (`Roboto:100,300,400,500,700,900`), taken from the project's own `roboto-fontface` 0.10.0 dependency, Latin subset, `font-display: swap`. |
| `vite.config.js` | `base: './'`, `build.outDir: '../../public/previews/openai-chatbot'`, `emptyOutDir: true`. | Relative asset paths for the stage. |
| `package.json` | Added an `assets` script. **Dependencies and lockfile are unchanged.** | – |

`openai`, `axios`, `webfontloader` and `vue-cli-plugin-vuetify` are still listed, so the original
lockfile stays valid, but they are no longer bundled.

### Bridge behaviour (`openai-bridge.js`)

**Key source**
- The bar key is preferred. It lives in a module variable (a Vue `ref`) and is never written to
  storage or cookies.
- A key typed into the original drawer field still works exactly as in 2022. It is used only after
  the original 51-character check and `listModels()` (`GET /v1/models`) both succeed.

**With a key**, the original request is translated to Chat Completions:

| Original (completions) | Sent to `POST https://api.openai.com/v1/chat/completions` |
|---|---|
| `model: "text-davinci-002"` | `model: "gpt-6-luna"` (constant `LIVE_MODEL`) |
| `prompt: "You are a chat bot\n--------\nuser:${m}\nyou:"` | `messages: [{role:"developer", content:"You are a chat bot"}, {role:"user", content:m}]` |
| `max_tokens` (slider, 200–1500) | `max_completion_tokens` (same value) |
| `temperature` (slider, 0.1–1.0) | `temperature` (same value) + `reasoning_effort: "none"` |
| reads `response.data.choices[0].text` | `choices[0].message.content` is returned as `{ data: { choices: [{ text }] } }` |

**Without a key**, the bot answers inside the original AI bubble with:
`[Preview notice - not an AI reply] text-davinci-002 was retired by OpenAI, so live replies need your own OpenAI API key. Paste one in the bar above this app, then send your message again.`
No AI answer is ever invented.

**On errors** (HTTP error, network error, empty reply), the same labelled notice style is used,
for example `… OpenAI returned an error (401): Incorrect API key provided.` The original call site
has no `try/catch`, so the bridge never throws.

### Fit to the stage (`preview.css`, original component CSS untouched)

The original layout assumed a window about 1000 px tall and at least 923 px wide. The shell is
smaller, so three rules adjust it:

- `html, body { overflow: hidden }`, and `#app` fills the space under the bar (`container-type: size`).
- `.v-application__wrap { min-height: 100cqh }`, instead of `100vh`.
- `.wrapper { height: min(900px, 100cqh) }`, instead of a fixed `900px`.
- Below 923 px wide, the 600 px message column is centered (`width: 100%; max-width: 600px`)
  instead of using `margin-left: 35%`.

## Differences from the live 2022 build

Side-by-side captures: `qa/previews/openai-chatbot-compare.png` (after sending one message without
a key) and `qa/previews/openai-chatbot-compare-drawer.png` (settings drawer open). The live site is
on the left, the preview on the right. Both use the same app size, 1280×1000; the preview is 43 px
taller because of the bar.

- **Identical:** app bar icons and colours, drawer (Temperature / Max Tokens sliders, API Key field,
  "Get Your Key Here"), Message field with 0/100 counter, purple SEND button, bubble colours,
  shapes and Arial text.
- **Live at 1280×800:** the page is 900 px tall, and the autofocused Message field scrolls the
  window 100 px, which hides the app bar. In the preview the app fits the stage, so the app bar and
  footer are both visible.
- **Live at 390 px wide:** the page scrolls horizontally (scrollWidth 737). In the preview the
  column is centered and there is no horizontal scroll from 360 px up.
- **Send without a key:**
  - Live: nothing happens. The text stays in the field with the red "Please Enter a Valid API Key"
    hint.
  - Preview: the message is sent and the notice bubble appears. The original hint still shows until
    a bar key is set.
- **Fonts:** Roboto comes from `roboto-fontface` 0.10.0 (Roboto v2), while the live site gets the
  current Google Fonts Roboto. Tiny glyph differences are possible.
- **Errors:** they appear as notice bubbles instead of unhandled promise rejections.

## Network, privacy, theme

- **No key:** zero third-party requests. Everything is same-origin, including fonts.
- **With a key:** only `api.openai.com` is contacted. CORS is allowed: a preflight from
  `http://127.0.0.1:4430` returned `Access-Control-Allow-Origin` for that origin.
- The original outbound links (GitHub, LinkedIn, beta.openai.com) are unchanged.
- `portfolio:theme` messages are **ignored**. The original UI is hard-coded `theme="dark"` and is
  kept as designed.

## Payload (first visit, measured with `qa/measure_load.py`)

| | Original build | Preview |
|---|---|---|
| JS | 201,064 B (65.7 KB gzip) + 12.7 KB webfontloader chunk | 164,295 B (58.2 KB gzip) |
| CSS | 544,362 B (76.5 KB gzip) | 282,091 B (36.1 KB gzip) |
| Icon font | 325 KB MDI woff2 | 964 B (inlined) |
| Text font | Google Fonts CSS + Roboto (third-party) | 2 × ~16 KB Roboto woff2 (400, 500), same-origin |
| Total transfer | ≈ 0.5 MB | **≈ 128 KB gzip** (480 KB raw, 5 requests) |
| On disk | 3.6 MB (incl. eot/ttf/woff MDI) | 550 KB |

First contentful paint was ~170 ms on the local server.

## Rebuild

```powershell
cd previews-src/openai-chatbot
npm ci            # original lockfile, Node 24 OK
npm run build     # -> public/previews/openai-chatbot/
# optional, only to regenerate src/portfolio/generated/* (needs Python with fontTools + brotli):
npm run assets
```

## Test

Start a static server on port 4430:

```powershell
node scripts/dev-server.mjs --root public --port 4430
```

Then run, from `previews-src/openai-chatbot`:

```powershell
python qa/test_preview.py       # interactions, console errors, no third-party requests, 360–1400 px, mocked key flow
python qa/compare_live.py       # side-by-side with https://openai-chat-bot.pages.dev/
python qa/measure_load.py http://127.0.0.1:4430/previews/openai-chatbot/
```

`test_preview.py` covers the key flow with a **mocked** `api.openai.com` route (QA only). It
checks that the request goes to Chat Completions, carries `Bearer <bar key>`, uses
`model: gpt-6-luna`, has the translated messages, sends slider values 1000 / 0.7 and
`reasoning_effort: none`, and that the reply renders in the original bubble. It also checks the
401 error notice, that **Clear** brings back the no-key notice without a request, and that nothing
is written to storage.

## Known limitations

- **Live replies are not tested against the real API.** No key was available, so only the mocked
  route was used.
- **`gpt-6-luna` may be deprecated later.** The model is the single constant `LIVE_MODEL` in
  `openai-bridge.js`.
- **Original quirks are kept as-is:**
  - no loading indicator; both bubbles appear when the reply arrives
  - the drawer's plain-text API Key field and its 51-character rule, which modern `sk-proj-…` keys
    fail, so the bar is the practical path
  - nested `v-app` elements
  - the email button copies Colby's address to the clipboard
