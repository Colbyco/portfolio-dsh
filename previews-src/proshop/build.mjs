// Copies the hand-written viewer (site/) into public/previews/proshop/.
// data.json is produced separately by fetch-data.mjs (needs `gh` + the local clone).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, 'site')
const out = join(here, '..', '..', 'public', 'previews', 'proshop')
mkdirSync(out, { recursive: true })
// remove stale files, keep data.json
for (const name of readdirSync(out)) if (name !== 'data.json') rmSync(join(out, name), { recursive: true, force: true })
cpSync(src, out, { recursive: true })
if (!existsSync(join(out, 'data.json'))) console.warn('warning: data.json missing - run `npm run data` first')
console.log('copied site/ ->', out)
